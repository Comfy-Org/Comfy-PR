#!/usr/bin/env bun
import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { normalizeGithubUrl } from "@/src/normalizeGithubUrl";
import DIE from "@snomiao/die";
import { $ } from "bun";
import isCI from "is-ci";
import { pageFlow } from "sflow";

/**
 * GitHub Frontend Issue Transfer Task
 *
 * Workflow:
 * 1. Fetch new/unseen issues from Comfy-Org/ComfyUI with label "frontend"
 * 2. For each issue:
 *    1. Create corresponding issues in Comfy-Org/ComfyUI_frontend, copying title, body (+meta and backlinks), labels, assignees
 *    2. Comment on original issue that it's been transferred
 *    3. Close original issue in Comfy-Org/ComfyUI
 *    4. Track transferred issues to avoid duplicates
 */

const config = {
  srcRepoUrl: "https://github.com/Comfy-Org/ComfyUI",
  dstRepoUrl: "https://github.com/Comfy-Org/ComfyUI_frontend",
  frontendLabel: "frontend",
  transferComment: (newIssueUrl: string) =>
    `This issue has been transferred to the frontend repository: ${newIssueUrl}\n\nPlease continue the discussion there.`,
};

export type GithubFrontendIssueTransferTask = {
  sourceIssueNumber: number;
  sourceIssueUrl: string;
  targetIssueNumber?: number;
  targetIssueUrl?: string;
  transferredAt?: Date;
  commentPosted?: boolean;
  commentUrl?: string;
  error?: string;
};

export const GithubFrontendIssueTransferTask = db.collection<GithubFrontendIssueTransferTask>(
  "GithubFrontendIssueTransferTask",
);

await GithubFrontendIssueTransferTask.createIndex({ sourceIssueNumber: 1 }, { unique: true });

const save = async (
  task: { sourceIssueNumber: number } & Partial<GithubFrontendIssueTransferTask>,
) => {
  // Normalize URLs to handle both comfyanonymous and Comfy-Org formats
  const normalizedTask = {
    ...task,
    sourceIssueUrl: task.sourceIssueUrl ? normalizeGithubUrl(task.sourceIssueUrl) : undefined,
    targetIssueUrl: task.targetIssueUrl ? normalizeGithubUrl(task.targetIssueUrl) : undefined,
    commentUrl: task.commentUrl ? normalizeGithubUrl(task.commentUrl) : undefined,
  };

  // Incremental migration: Check both normalized and old URL formats
  // This allows gradual migration as tasks are processed
  const existing = await GithubFrontendIssueTransferTask.findOne({
    $or: [
      { sourceIssueNumber: normalizedTask.sourceIssueNumber },
      ...(normalizedTask.sourceIssueUrl
        ? [
            { sourceIssueUrl: normalizedTask.sourceIssueUrl },
            { sourceIssueUrl: normalizedTask.sourceIssueUrl.replace(/Comfy-Org/i, "comfyanonymous") },
          ]
        : []),
    ],
  });

  return (await GithubFrontendIssueTransferTask.findOneAndUpdate(
    existing ? { _id: existing._id } : { sourceIssueNumber: normalizedTask.sourceIssueNumber },
    { $set: normalizedTask },
    { upsert: true, returnDocument: "after" },
  )) || DIE("never");
};

if (import.meta.main) {
  await runGithubFrontendIssueTransferTask();
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

async function runGithubFrontendIssueTransferTask() {
  const sourceRepo = parseGithubRepoUrl(config.srcRepoUrl);
  const targetRepo = parseGithubRepoUrl(config.dstRepoUrl);

  // Fetch all open issues with "frontend" label from source repo using pagination
  await pageFlow(1, async (page) => {
    const per_page = 100;
    const sourceIssues = await gh.issues.listForRepo({
      owner: sourceRepo.owner,
      repo: sourceRepo.repo,
      labels: config.frontendLabel,
      state: "open",
      page,
      per_page,
    });

    console.log(
      `Found ${sourceIssues.data.length} open frontend issues (page ${page}) in ${config.srcRepoUrl}`,
    );

    return {
      data: sourceIssues.data,
      next: sourceIssues.data.length >= per_page ? page + 1 : undefined,
    };
  })
    .flat()
    .map(async (issue) => {
      // Skip pull requests (they come through the issues API too)
      if (issue.pull_request) {
        return null;
      }

      const existingTask = await GithubFrontendIssueTransferTask.findOne({
        sourceIssueNumber: issue.number,
      });

      // Skip if already transferred
      if (existingTask?.targetIssueUrl) {
        console.log(`Issue #${issue.number} already transferred to ${existingTask.targetIssueUrl}`);
        return existingTask;
      }

      console.log(issue.html_url);
      // Normalize URL before saving to handle both comfyanonymous and Comfy-Org formats
      let task = await save({
        sourceIssueNumber: issue.number,
        sourceIssueUrl: normalizeGithubUrl(issue.html_url),
      });

      try {
        const comments = await pageFlow(1, async (page) => {
          const per_page = 100;
          const comments = await gh.issues.listComments({
            owner: sourceRepo.owner,
            repo: sourceRepo.repo,
            issue_number: issue.number,
            page,
            per_page,
          });

          return {
            data: comments.data,
            next: comments.data.length >= per_page ? page + 1 : undefined,
          };
        })
          .flat()
          .map((comment) => `@${comment.user?.login}: <pre>${comment.body}</pre>`)
          .toArray();
        // Create new issue in target repo
        const body = `
${issue.body || ""}        
\n\n---

*This issue is transferred from: ${issue.html_url}*

Original issue was created ${issue.user?.login?.replace(/^/, "by @")} at ${new Date(issue.created_at).toISOString()}

${comments.length ? `\n\n**Original Comments:**\n\n${comments.join("\n\n")}` : ""}
`;

        const newIssue = await gh.issues
          .create({
            owner: targetRepo.owner,
            repo: targetRepo.repo,
            title: issue.title,
            body,
            labels: issue.labels
              .map((label) => (typeof label === "string" ? label : label.name))
              .filter((name): name is string => !!name)
              .filter((name) => name.toLowerCase() !== "frontend"),
            assignees: issue.assignees
              ?.map((assignee) => assignee.login)
              .filter((login): login is string => !!login),
          })
          .catch((e) => {
            // try move the assignee to body when "assignees huchenlei cannot be assigned to this issue" matched
            const failedAssignee = e.message.match(
              /assignees (\w+) cannot be assigned to this issue/,
            )?.[1];
            if (failedAssignee) {
              const newBody =
                body +
                `\n\n*Note: @${failedAssignee} was originally assigned to this issue but could not be assigned in the target repository.*`;
              return gh.issues.create({
                owner: targetRepo.owner,
                repo: targetRepo.repo,
                title: issue.title,
                body: newBody,
                labels: issue.labels
                  .map((label) => (typeof label === "string" ? label : label.name))
                  .filter((name): name is string => !!name)
                  .filter((name) => name.toLowerCase() !== "frontend"),
                assignees: issue.assignees
                  ?.map((assignee) => assignee.login)
                  .filter((login): login is string => !!login)
                  .filter((login) => login !== failedAssignee),
              });
            }

            throw e;
          });

        console.log(
          `Created issue #${newIssue.data.number} in ${targetRepo.owner}/${targetRepo.repo}`,
        );
        if (!isCI && process.platform === "darwin") {
          await $`open ${newIssue.data.html_url}`;
        }
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

export default runGithubFrontendIssueTransferTask;
