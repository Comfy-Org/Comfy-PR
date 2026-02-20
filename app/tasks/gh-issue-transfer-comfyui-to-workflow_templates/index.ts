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
 * GitHub Workflow Templates Issue Transfer Task
 *
 * Workflow:
 * 1. Fetch new/unseen issues from Comfy-Org/ComfyUI with label "workflow_templates"
 * 2. For each issue:
 *    1. Create corresponding issues in Comfy-Org/workflow_templates, copying title, body (+meta and backlinks), labels, assignees
 *    2. Comment on original issue that it's been transferred
 *    3. Close original issue in Comfy-Org/ComfyUI
 *    4. Track transferred issues to avoid duplicates
 */

const config = {
  srcRepoUrl: "https://github.com/Comfy-Org/ComfyUI",
  dstRepoUrl: "https://github.com/Comfy-Org/workflow_templates",
  workflowTemplatesLabel: "workflow_templates",
  transferComment: (newIssueUrl: string) =>
    `This issue has been transferred to the workflow_templates repository: ${newIssueUrl}\n\nPlease continue the discussion there.`,
};

export type GithubWorkflowTemplatesIssueTransferTask = {
  sourceIssueNumber: number;
  sourceIssueUrl: string;
  targetIssueNumber?: number;
  targetIssueUrl?: string;
  transferredAt?: Date;
  commentPosted?: boolean;
  commentUrl?: string;
  error?: string;
};

export const GithubWorkflowTemplatesIssueTransferTask =
  db.collection<GithubWorkflowTemplatesIssueTransferTask>(
    "GithubWorkflowTemplatesIssueTransferTask",
  );

await GithubWorkflowTemplatesIssueTransferTask.createIndex(
  { sourceIssueNumber: 1 },
  { unique: true },
);

const save = async (
  task: { sourceIssueNumber: number } & Partial<GithubWorkflowTemplatesIssueTransferTask>,
) => {
  // Normalize URLs to handle both comfyanonymous and Comfy-Org formats
  const normalizedTask = {
    ...task,
    sourceIssueUrl: task.sourceIssueUrl ? normalizeGithubUrl(task.sourceIssueUrl) : undefined,
    targetIssueUrl: task.targetIssueUrl ? normalizeGithubUrl(task.targetIssueUrl) : undefined,
    commentUrl: task.commentUrl ? normalizeGithubUrl(task.commentUrl) : undefined,
  };

  // Incremental migration: Check both normalized and old URL formats
  const existing = await GithubWorkflowTemplatesIssueTransferTask.findOne({
    $or: [
      { sourceIssueNumber: normalizedTask.sourceIssueNumber },
      ...(normalizedTask.sourceIssueUrl
        ? [
            { sourceIssueUrl: normalizedTask.sourceIssueUrl },
            {
              sourceIssueUrl: normalizedTask.sourceIssueUrl.replace(/Comfy-Org/i, "comfyanonymous"),
            },
          ]
        : []),
    ],
  });

  return (
    (await GithubWorkflowTemplatesIssueTransferTask.findOneAndUpdate(
      existing ? { _id: existing._id } : { sourceIssueNumber: normalizedTask.sourceIssueNumber },
      { $set: normalizedTask },
      { upsert: true, returnDocument: "after" },
    )) || DIE("never")
  );
};

if (import.meta.main) {
  await runGithubWorkflowTemplatesIssueTransferTask();
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

async function runGithubWorkflowTemplatesIssueTransferTask() {
  const sourceRepo = parseGithubRepoUrl(config.srcRepoUrl);
  const targetRepo = parseGithubRepoUrl(config.dstRepoUrl);

  // Fetch all open issues with "workflow_templates" label from source repo using pagination
  await pageFlow(1, async (page) => {
    const per_page = 100;
    const sourceIssues = await gh.issues.listForRepo({
      owner: sourceRepo.owner,
      repo: sourceRepo.repo,
      labels: config.workflowTemplatesLabel,
      state: "open",
      page,
      per_page,
    });

    console.log(
      `Found ${sourceIssues.data.length} open workflow_templates issues (page ${page}) in ${config.srcRepoUrl}`,
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

      const existingTask = await GithubWorkflowTemplatesIssueTransferTask.findOne({
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

        const newIssue = await gh.issues.create({
          owner: targetRepo.owner,
          repo: targetRepo.repo,
          title: issue.title,
          body,
          labels: issue.labels
            .map((label) => (typeof label === "string" ? label : label.name))
            .filter((name): name is string => !!name)
            .filter((name) => name.toLowerCase() !== "workflow_templates"),
          assignees: issue.assignees
            ?.map((assignee) => assignee.login)
            .filter((login): login is string => !!login),
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

export default runGithubWorkflowTemplatesIssueTransferTask;
