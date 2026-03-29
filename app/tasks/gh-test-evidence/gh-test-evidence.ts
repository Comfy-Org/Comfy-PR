import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { ghc } from "@/lib/github/githubCached";
import { ghUser } from "@/src/ghUser";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import { OpenAI } from "openai";
import { pageFlow } from "sflow";
import z from "zod";

const REPOS = ["https://github.com/Comfy-Org/desktop", "https://github.com/Comfy-Org/ComfyUI"];

const BOT_COMMENT_MARKER = "<!-- COMFY_PR_BOT_TEST_EVIDENCE -->";

// Batch limit to avoid CI timeout (10 min limit, ~3s per PR = ~200 max, use 50 for safety)
const MAX_PRS_PER_RUN = 50;
// Time limit in ms (8 minutes to leave buffer before 10 min timeout)
const TIME_LIMIT_MS = 8 * 60 * 1000;

const TestEvidenceSchema = z.object({
  isTestExplanationIncluded: z
    .boolean()
    .describe("true if PR body includes test plan or test explanation"),
  isTestScreenshotIncluded: z
    .boolean()
    .describe("true if PR body includes test screenshots or images"),
  isTestVideoIncluded: z
    .boolean()
    .describe("true if PR body includes test videos or YouTube links"),
});

type TestEvidence = z.infer<typeof TestEvidenceSchema>;

type GithubTestEvidenceTask = {
  prUrl: string;
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  prUpdatedAt: Date;
  repoUrl: string;

  evidence?: TestEvidence;
  evidenceAnalyzedAt?: Date;

  commentId?: number;
  commentedAt?: Date;

  taskUpdatedAt: Date;
};

const GithubTestEvidenceTask = db.collection<GithubTestEvidenceTask>("GithubTestEvidenceTask");

async function saveTask(task: Partial<GithubTestEvidenceTask> & { prUrl: string }) {
  return (
    (await GithubTestEvidenceTask.findOneAndUpdate(
      { prUrl: task.prUrl },
      { $set: { ...task, taskUpdatedAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    )) || DIE("Failed to save task")
  );
}

if (import.meta.main) {
  await runGhTestEvidenceTask();
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

export default async function runGhTestEvidenceTask() {
  console.log("Starting test evidence check task...");
  const startTime = Date.now();
  let processedCount = 0;

  for (const repoUrl of REPOS) {
    console.log(`Processing repo: ${repoUrl}`);

    // Get all open PRs
    const prs = await pageFlow(1, async (page, per_page = 100) => {
      const { data } = await ghc.pulls.list({
        ...parseGithubRepoUrl(repoUrl),
        state: "open",
        page,
        per_page,
      });
      return { data, next: data.length >= per_page ? page + 1 : null };
    })
      .flat()
      .toArray();

    console.log(`Found ${prs.length} open PRs in ${repoUrl}`);

    for (const pr of prs) {
      // Check time limit
      const elapsed = Date.now() - startTime;
      if (elapsed >= TIME_LIMIT_MS) {
        console.log(
          `Time limit reached (${Math.round(elapsed / 1000)}s), stopping. Processed ${processedCount} PRs.`,
        );
        return;
      }

      // Check batch limit
      if (processedCount >= MAX_PRS_PER_RUN) {
        console.log(`Batch limit reached (${MAX_PRS_PER_RUN} PRs), stopping.`);
        return;
      }

      try {
        const wasProcessed = await processPR(pr, repoUrl);
        if (wasProcessed) processedCount++;
      } catch (error) {
        console.error(`Error processing PR ${pr.html_url}:`, error);
      }
    }
  }

  console.log(`Test evidence check task completed. Processed ${processedCount} PRs.`);
}

/** Process a PR and return true if any work was done (API calls made) */
async function processPR(
  pr: Awaited<ReturnType<typeof ghc.pulls.list>>["data"][0],
  repoUrl: string,
): Promise<boolean> {
  // Skip drafts
  if (pr.draft) {
    console.log(`Skipping draft PR: ${pr.html_url}`);
    return false;
  }

  // Check existing task state
  const existingTask = await GithubTestEvidenceTask.findOne({ prUrl: pr.html_url });

  // Check if PR was updated since last analysis
  const prUpdatedAt = new Date(pr.updated_at);
  const needsAnalysis =
    !existingTask?.evidenceAnalyzedAt || prUpdatedAt > existingTask.evidenceAnalyzedAt;

  // If no analysis needed and we have comment state tracked, skip entirely
  if (!needsAnalysis && existingTask?.evidence) {
    const hasMissingEvidence =
      !existingTask.evidence.isTestExplanationIncluded ||
      (!existingTask.evidence.isTestScreenshotIncluded &&
        !existingTask.evidence.isTestVideoIncluded);
    const hasComment = !!existingTask.commentId;

    // If state is consistent (has warning + has comment, or no warning + no comment), skip
    if ((hasMissingEvidence && hasComment) || (!hasMissingEvidence && !hasComment)) {
      return false;
    }
  }

  // Save basic PR info
  let task = await saveTask({
    prUrl: pr.html_url,
    prNumber: pr.number,
    prTitle: pr.title,
    prBody: pr.body,
    prUpdatedAt,
    repoUrl,
  });

  if (needsAnalysis) {
    console.log(`Analyzing PR: ${pr.html_url}`);
    const evidence = await analyzeTestEvidence(pr);
    task = await saveTask({
      prUrl: pr.html_url,
      evidence,
      evidenceAnalyzedAt: new Date(),
    });
  }

  // Determine what's missing
  const missingItems: string[] = [];
  if (!task.evidence?.isTestExplanationIncluded) missingItems.push("test explanation");
  if (!task.evidence?.isTestScreenshotIncluded) missingItems.push("screenshot");
  if (!task.evidence?.isTestVideoIncluded) missingItems.push("video");

  // Get existing bot comments
  const botUser = await ghUser();
  const comments = await ghc.issues.listComments(parseIssueUrl(pr.html_url));
  const existingBotComment = comments.data.find(
    (c) => c.user?.login === botUser.login && c.body?.includes(BOT_COMMENT_MARKER),
  );

  if (missingItems.length > 0) {
    // Generate warning message
    const warningMessage = generateWarningMessage(task.evidence!);

    if (existingBotComment) {
      // Update existing comment if content changed
      if (existingBotComment.body !== warningMessage) {
        console.log(`Updating comment on PR: ${pr.html_url}`);
        await gh.issues.updateComment({
          ...parseIssueUrl(pr.html_url),
          comment_id: existingBotComment.id,
          body: warningMessage,
        });
        await saveTask({
          prUrl: pr.html_url,
          commentId: existingBotComment.id,
          commentedAt: new Date(),
        });
      }
    } else {
      // Create new comment
      console.log(`Creating comment on PR: ${pr.html_url}`);
      const comment = await gh.issues.createComment({
        ...parseIssueUrl(pr.html_url),
        body: warningMessage,
      });
      await saveTask({
        prUrl: pr.html_url,
        commentId: comment.data.id,
        commentedAt: new Date(),
      });
    }
  } else {
    // All evidence present - delete bot comment if it exists
    if (existingBotComment) {
      console.log(`Deleting comment on PR (all evidence present): ${pr.html_url}`);
      await gh.issues.deleteComment({
        ...parseIssueUrl(pr.html_url),
        comment_id: existingBotComment.id,
      });
      await saveTask({
        prUrl: pr.html_url,
        commentId: undefined,
        commentedAt: undefined,
      });
    }
  }

  return true;
}

async function analyzeTestEvidence(
  pr: Awaited<ReturnType<typeof ghc.pulls.list>>["data"][0],
): Promise<TestEvidence> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || DIE("OPENAI_API_KEY not found"),
  });

  const prompt = `Analyze this GitHub pull request and determine what test evidence is included.

PR Title: ${pr.title}

PR Body:
${pr.body || "(empty)"}

Return a JSON object with these boolean fields:
- isTestExplanationIncluded: true if the PR body includes any test plan, test steps, or explanation of how the changes were tested
- isTestScreenshotIncluded: true if the PR body includes screenshots, images, or GIFs (look for image URLs, github user-attachments, etc.)
- isTestVideoIncluded: true if the PR body includes videos or YouTube links (look for youtube.com, youtu.be, video links)

Be lenient - if there's any indication of testing explanation or visual evidence, mark it as included.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "test_evidence",
        strict: true,
        schema: {
          type: "object",
          properties: {
            isTestExplanationIncluded: { type: "boolean" },
            isTestScreenshotIncluded: { type: "boolean" },
            isTestVideoIncluded: { type: "boolean" },
          },
          required: [
            "isTestExplanationIncluded",
            "isTestScreenshotIncluded",
            "isTestVideoIncluded",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const response = completion.choices[0]?.message.content || DIE("No response from OpenAI");
  return TestEvidenceSchema.parse(JSON.parse(response));
}

function generateWarningMessage(evidence: TestEvidence): string {
  const warnings: string[] = [];

  if (!evidence.isTestExplanationIncluded) {
    warnings.push(`⚠️ **Warning: Test Explanation Missing**

If this PR modifies behavior that requires testing, a test explanation is required. PRs lacking applicable test explanations may not be reviewed until added. Please add test explanations to ensure code quality and prevent regressions.`);
  }

  if (!evidence.isTestScreenshotIncluded && !evidence.isTestVideoIncluded) {
    warnings.push(`⚠️ **Warning: Visual Documentation Missing**

If this PR changes user-facing behavior, visual proof (screen recording or screenshot) is required. PRs without applicable visual documentation may not be reviewed until provided.

You can add it by:
- GitHub: Drag & drop media directly into the PR description
- YouTube: Include a link to a short demo`);
  }

  const parts = [BOT_COMMENT_MARKER, "## Test Evidence Check", ...warnings];

  return parts.join("\n\n");
}
