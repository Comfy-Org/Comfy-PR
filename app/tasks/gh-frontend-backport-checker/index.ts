#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { gh } from "@/src/gh";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow from "sflow";
import { upsertSlackMessage } from "../gh-desktop-release-notification/upsertSlackMessage";

/**
 * GitHub Frontend Backport Checker Task
 *
 * Workflow:
 * 1. Monitor ComfyUI_frontend releases
 * 2. Identify bugfix commits (keywords: fix, bugfix, hotfix, patch, bug)
 * 3. For each bugfix, find the associated PR
 * 4. Check PR labels for backport indicators
 * 5. Check PR comments for backport mentions
 * 6. Track status and send Slack summary
 */

const config = {
  repo: "https://github.com/Comfy-Org/ComfyUI_frontend",
  slackChannel: "frontend",
  bugfixPatterns: /\b(fix|bugfix|hotfix|patch|bug)\b/i,
  backportLabels: ["backport", "backport-stable", "needs-backport", "stable"],
  processSince: new Date("2025-01-01T00:00:00Z").toISOString(),
  maxReleasesToCheck: 5,
};

export type BackportStatus = "not-needed" | "needed" | "in-progress" | "completed" | "unknown";

export type GithubFrontendBackportCheckerTask = {
  releaseUrl: string;
  releaseTag: string;
  releaseCreatedAt: Date;
  commitSha: string;
  commitMessage: string;
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;
  backportStatus: BackportStatus;
  backportLabels: string[];
  backportMentioned: boolean;
  checkedAt: Date;
  slackMessage?: {
    text: string;
    channel: string;
    url?: string;
  };
};

export const GithubFrontendBackportCheckerTask = db.collection<GithubFrontendBackportCheckerTask>(
  "GithubFrontendBackportCheckerTask",
);

const save = async (task: { commitSha: string } & Partial<GithubFrontendBackportCheckerTask>) =>
  (await GithubFrontendBackportCheckerTask.findOneAndUpdate(
    { commitSha: task.commitSha },
    { $set: task },
    { upsert: true, returnDocument: "after" },
  )) || DIE("never");

if (import.meta.main) {
  await runGithubFrontendBackportCheckerTask();
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

async function runGithubFrontendBackportCheckerTask() {
  await GithubFrontendBackportCheckerTask.createIndex({ commitSha: 1 }, { unique: true });
  await GithubFrontendBackportCheckerTask.createIndex({ releaseTag: 1 });
  await GithubFrontendBackportCheckerTask.createIndex({ checkedAt: 1 });

  const { owner, repo } = parseGithubRepoUrl(config.repo);

  // Fetch recent releases
  const releases = await gh.repos
    .listReleases({
      owner,
      repo,
      per_page: config.maxReleasesToCheck,
    })
    .then((e) => e.data);

  console.log(`Found ${releases.length} recent releases to check`);

  const allBugfixes: GithubFrontendBackportCheckerTask[] = [];

  // Process each release
  await sflow(releases)
    .filter((release) => +new Date(release.created_at) >= +new Date(config.processSince))
    .map(async (release) => {
      console.log(`\nProcessing release: ${release.tag_name}`);

      // Get commits for this release
      const comparison = await gh.repos
        .compareCommitsWithBasehead({
          owner,
          repo,
          basehead: `${release.target_commitish}...${release.tag_name}`,
        })
        .then((e) => e.data);

      const commits = comparison.commits || [];
      console.log(`  Found ${commits.length} commits in release`);

      // Filter bugfix commits
      const bugfixCommits = commits.filter((commit) =>
        config.bugfixPatterns.test(commit.commit.message),
      );

      console.log(`  Found ${bugfixCommits.length} bugfix commits`);

      // Process each bugfix commit
      await sflow(bugfixCommits)
        .map(async (commit) => {
          const commitSha = commit.sha;
          const commitMessage = commit.commit.message.split("\n")[0]; // First line only

          console.log(`    Checking commit: ${commitSha.substring(0, 7)} - ${commitMessage}`);

          // Find associated PR(s)
          const prs = await gh.repos
            .listPullRequestsAssociatedWithCommit({
              owner,
              repo,
              commit_sha: commitSha,
            })
            .then((e) => e.data);

          let backportStatus: BackportStatus = "unknown";
          let backportLabels: string[] = [];
          let backportMentioned = false;
          let prNumber: number | undefined;
          let prUrl: string | undefined;
          let prTitle: string | undefined;

          if (prs.length > 0) {
            // Use the first PR (typically the original PR)
            const pr = prs[0];
            prNumber = pr.number;
            prUrl = pr.html_url;
            prTitle = pr.title;

            // Check labels
            const labels = pr.labels.map((l) => (typeof l === "string" ? l : l.name));
            backportLabels = labels.filter((l) =>
              config.backportLabels.some((bl) => l.toLowerCase().includes(bl.toLowerCase())),
            );

            // Check PR body and comments for backport mentions
            const prDetails = await gh.pulls.get({ owner, repo, pull_number: prNumber });
            const bodyText = (prDetails.data.body || "").toLowerCase();

            const comments = await gh.issues
              .listComments({
                owner,
                repo,
                issue_number: prNumber,
              })
              .then((e) => e.data);

            const commentTexts = comments.map((c) => c.body?.toLowerCase() || "").join(" ");

            backportMentioned =
              /backport/i.test(bodyText) ||
              /backport/i.test(commentTexts) ||
              /stable/i.test(bodyText) ||
              /stable/i.test(commentTexts);

            // Determine status
            if (backportLabels.length > 0) {
              if (backportLabels.some((l) => l.toLowerCase().includes("completed"))) {
                backportStatus = "completed";
              } else if (backportLabels.some((l) => l.toLowerCase().includes("in-progress"))) {
                backportStatus = "in-progress";
              } else if (backportLabels.some((l) => l.toLowerCase().includes("needs"))) {
                backportStatus = "needed";
              } else {
                backportStatus = "needed";
              }
            } else if (backportMentioned) {
              backportStatus = "needed";
            } else {
              backportStatus = "not-needed";
            }

            console.log(`      PR #${prNumber}: ${backportStatus} (labels: ${backportLabels.join(", ")})`);
          } else {
            console.log(`      No PR found for commit`);
            backportStatus = "unknown";
          }

          // Save to database
          const task = await save({
            releaseUrl: release.html_url,
            releaseTag: release.tag_name,
            releaseCreatedAt: new Date(release.created_at),
            commitSha,
            commitMessage,
            prNumber,
            prUrl,
            prTitle,
            backportStatus,
            backportLabels,
            backportMentioned,
            checkedAt: new Date(),
          });

          allBugfixes.push(task);
          return task;
        })
        .run();
    })
    .run();

  // Generate and send Slack summary if there are bugfixes
  if (allBugfixes.length > 0) {
    const summary = generateSlackSummary(allBugfixes);
    console.log("\nSlack Summary:\n", summary);

    try {
      const slackMessage = await upsertSlackMessage({
        channelName: config.slackChannel,
        text: summary,
      });

      console.log(`Slack message sent: ${slackMessage.url}`);

      // Update all tasks with the slack message info
      await sflow(allBugfixes)
        .map(async (task) => {
          await save({
            commitSha: task.commitSha,
            slackMessage: {
              text: summary,
              channel: slackMessage.channel,
              url: slackMessage.url,
            },
          });
        })
        .run();
    } catch (error) {
      console.error("Failed to send Slack message:", error);
    }
  } else {
    console.log("\nNo bugfixes found in recent releases");
  }

  console.log(`\nProcessed ${allBugfixes.length} bugfix commits`);
}

function generateSlackSummary(bugfixes: GithubFrontendBackportCheckerTask[]): string {
  const grouped = new Map<string, GithubFrontendBackportCheckerTask[]>();

  // Group by release
  bugfixes.forEach((bf) => {
    const key = bf.releaseTag;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(bf);
  });

  let summary = "🔄 *ComfyUI_frontend Backport Status Report*\n\n";

  for (const [releaseTag, items] of grouped) {
    const releaseUrl = items[0].releaseUrl;
    summary += `*<${releaseUrl}|Release ${releaseTag}>*\n`;

    // Sort by status (needed/in-progress first)
    const sorted = items.sort((a, b) => {
      const order = { needed: 0, "in-progress": 1, completed: 2, unknown: 3, "not-needed": 4 };
      return order[a.backportStatus] - order[b.backportStatus];
    });

    sorted.forEach((item) => {
      const emoji = getStatusEmoji(item.backportStatus);
      const prLink = item.prUrl ? `<${item.prUrl}|#${item.prNumber}>` : "No PR";
      const labels = item.backportLabels.length > 0 ? ` [${item.backportLabels.join(", ")}]` : "";

      summary += `  ${emoji} ${prLink}: ${item.prTitle || item.commitMessage}${labels}\n`;
    });

    summary += "\n";
  }

  summary += `_Checked ${bugfixes.length} bugfix commits across ${grouped.size} releases_`;

  return summary;
}

function getStatusEmoji(status: BackportStatus): string {
  switch (status) {
    case "completed":
      return "✅";
    case "in-progress":
      return "🔄";
    case "needed":
      return "❌";
    case "not-needed":
      return "➖";
    case "unknown":
      return "❓";
    default:
      return "⚪";
  }
}

export default runGithubFrontendBackportCheckerTask;
