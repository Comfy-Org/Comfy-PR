#!/usr/bin/env bun
import { db } from "@/src/db";
import { gh } from "@/src/gh";
import { ghc } from "@/src/ghc";
import { ghPageFlow } from "@/src/ghPageFlow";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import isCI from "is-ci";

/**
 * GitHub Frontend to ComfyUI Issue Transfer Task
 *
 * Workflow:
 * 1. Fetch new/unseen issues from the ComfyUI_frontend repository with label "comfyui-core"
 * 2. For each issue:
 *    1. Create corresponding issues in the comfyanonymous/ComfyUI repository, copying title, body (+meta and backlinks), labels, assignees
 *    2. Comment on original issue that it's been transferred
 *    3. Close original issue in the frontend repository
 *    4. Track transferred issues to avoid duplicates
 */

const config = {
  srcRepoUrl: "https://github.com/Comfy-Org/ComfyUI_frontend",
  dstRepoUrl: "https://github.com/comfyanonymous/ComfyUI",
  comfyuiCoreLabel: "comfyui-core",
  transferComment: (newIssueUrl: string) =>
    `This issue has been transferred to the ComfyUI core repository: ${newIssueUrl}\n\nPlease continue the discussion there.`,
};

export type GithubFrontendToComfyuiIssueTransferTask = {
  sourceIssueNumber: number;
  sourceIssueUrl: string;
  targetIssueNumber?: number;
  targetIssueUrl?: string;
  transferredAt?: Date;
  commentPosted?: boolean;
  commentUrl?: string;
  error?: string;
};

export const GithubFrontendToComfyuiIssueTransferTask = db.collection<GithubFrontendToComfyuiIssueTransferTask>(
  "GithubFrontendToComfyuiIssueTransferTask",
);

await GithubFrontendToComfyuiIssueTransferTask.createIndex({ sourceIssueNumber: 1 }, { unique: true });

const save = async (task: { sourceIssueNumber: number } & Partial<GithubFrontendToComfyuiIssueTransferTask>) =>
  (await GithubFrontendToComfyuiIssueTransferTask.findOneAndUpdate(
    { sourceIssueNumber: task.sourceIssueNumber },
    { $set: task },
    { upsert: true, returnDocument: "after" },
  )) || DIE("never");

if (import.meta.main) {
  await runGithubFrontendToComfyuiIssueTransferTask();
  console.log("Done");
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

async function runGithubFrontendToComfyuiIssueTransferTask() {
  const sourceRepo = parseGithubRepoUrl(config.srcRepoUrl);
  const targetRepo = parseGithubRepoUrl(config.dstRepoUrl);

  // Fetch all open issues with "comfyui-core" label from source repo with paginated API
  await ghPageFlow(gh.issues.listForRepo)({
    owner: sourceRepo.owner,
    repo: sourceRepo.repo,
    labels: config.comfyuiCoreLabel,
    state: "open",
  })
    .map(async (issue) => {
      // Skip pull requests (they come through the issues API too)
      if (issue.pull_request) {
        return null;
      }

      const existingTask = await GithubFrontendToComfyuiIssueTransferTask.findOne({
        sourceIssueNumber: issue.number,
      });

      // Skip if already transferred
      if (existingTask?.targetIssueUrl) {
        console.log(`Issue #${issue.number} already transferred to ${existingTask.targetIssueUrl}`);
        return existingTask;
      }

      console.log(issue.html_url);
      let task = await save({
        sourceIssueNumber: issue.number,
        sourceIssueUrl: issue.html_url,
      });

      try {
        const comments = await ghPageFlow(ghc.issues.listComments)({
          owner: sourceRepo.owner,
          repo: sourceRepo.repo,
          issue_number: issue.number,
        })
          .map((comment) => `@${comment.user?.login}: <pre>${comment.body}</pre>`)
          .toArray();

        // Create new issue in target repo
        const body = `
${issue.body || ""}

---

*This issue is transferred from: ${issue.html_url}*

Original issue was created ${issue.user?.login?.replace(/^/, "by @")} at ${new Date(issue.created_at).toISOString()}

${comments.length ? `\n\n**Original Comments:**\n\n${comments.join("\n\n")}` : ""}
`;

        // body max length is 65536 chars
        const truncatedBody =
          body.length > 60000
            ? body.slice(0, 60000) + "\n\n...TRUNCATED, full content available in original issue"
            : body;

        const newIssue = await gh.issues.create({
          owner: targetRepo.owner,
          repo: targetRepo.repo,
          title: issue.title,
          body: truncatedBody.trim(),
          labels: issue.labels
            .map((label) => (typeof label === "string" ? label : label.name))
            .filter((name): name is string => !!name)
            .filter((name) => name.toLowerCase() !== "comfyui-core"),
          assignees: issue.assignees?.map((assignee) => assignee.login).filter((login): login is string => !!login),
        });

        console.log(`Created issue #${newIssue.data.number} in ${targetRepo.owner}/${targetRepo.repo}`);

        task = await save({
          sourceIssueNumber: issue.number,
          targetIssueNumber: newIssue.data.number,
          targetIssueUrl: newIssue.data.html_url,
          transferredAt: new Date(),
        });

        // Comment on original issue
        try {
          const comment = await gh.issues.createComment({
            owner: sourceRepo.owner,
            repo: sourceRepo.repo,
            issue_number: issue.number,
            body: config.transferComment(newIssue.data.html_url),
          });
          // close original issue
          await gh.issues.update({
            owner: sourceRepo.owner,
            repo: sourceRepo.repo,
            issue_number: issue.number,
            state: "closed",
          });

          console.log(`Posted comment on original issue #${issue.number}`);

          task = await save({
            sourceIssueNumber: issue.number,
            commentPosted: true,
            commentUrl: comment.data.html_url,
          });
        } catch (commentError) {
          console.error(`Failed to post comment on issue #${issue.number}:`, commentError);
          task = await save({
            sourceIssueNumber: issue.number,
            commentPosted: false,
            error: String(commentError),
          });
        }

        return task;
      } catch (error) {
        console.error(`Failed to transfer issue #${issue.number}:`, error);
        task = await save({
          sourceIssueNumber: issue.number,
          error: String(error),
        });
        return task;
      }
    })
    .filter((task) => task !== null)
    .log()
    .run();
}

export default runGithubFrontendToComfyuiIssueTransferTask;
