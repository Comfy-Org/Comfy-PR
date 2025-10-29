#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { gh } from "@/src/gh";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow from "sflow";

/**
 * GitHub Frontend Issue Transfer Task
 *
 * Workflow:
 * 1. Fetch new/unseen issues from comfyanonymous/ComfyUI with label "frontend"
 * 2. Create corresponding issues in Comfy-Org/ComfyUI_frontend
 * 3. Comment on original issue that it's been transferred
 * 4. Track transferred issues to avoid duplicates
 */

const config = {
  sourceRepo: {
    owner: "comfyanonymous",
    repo: "ComfyUI",
  },
  targetRepo: {
    owner: "Comfy-Org",
    repo: "ComfyUI_frontend",
  },
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

const save = async (task: { sourceIssueNumber: number } & Partial<GithubFrontendIssueTransferTask>) =>
  (await GithubFrontendIssueTransferTask.findOneAndUpdate(
    { sourceIssueNumber: task.sourceIssueNumber },
    { $set: task },
    { upsert: true, returnDocument: "after" },
  )) || DIE("never");

if (import.meta.main) {
  await runGithubFrontendIssueTransferTask();
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

async function runGithubFrontendIssueTransferTask() {
  // Fetch all open issues with "frontend" label from source repo
  const sourceIssues = await gh.issues.listForRepo({
    owner: config.sourceRepo.owner,
    repo: config.sourceRepo.repo,
    labels: config.frontendLabel,
    state: "open",
    per_page: 100,
  });

  console.log(
    `Found ${sourceIssues.data.length} open frontend issues in ${config.sourceRepo.owner}/${config.sourceRepo.repo}`,
  );

  console.log(sourceIssues.data.map((issue) => `#${issue.html_url}: ${issue.title}`).join("\n"));
  throw "check";

  await sflow(sourceIssues.data)
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

      let task = await save({
        sourceIssueNumber: issue.number,
        sourceIssueUrl: issue.html_url,
      });
      try {
        // Create new issue in target repo
        const backlink = `\n\n---\n\n*Transferred from: ${issue.html_url}*`;
        const newIssue = await gh.issues.create({
          owner: config.targetRepo.owner,
          repo: config.targetRepo.repo,
          title: issue.title,
          body: (issue.body || "") + backlink,
          labels: issue.labels
            .map((label) => (typeof label === "string" ? label : label.name))
            .filter((name): name is string => !!name),
          assignees: issue.assignees?.map((assignee) => assignee.login).filter((login): login is string => !!login),
        });

        console.log(`Created issue #${newIssue.data.number} in ${config.targetRepo.owner}/${config.targetRepo.repo}`);

        task = await save({
          sourceIssueNumber: issue.number,
          targetIssueNumber: newIssue.data.number,
          targetIssueUrl: newIssue.data.html_url,
          transferredAt: new Date(),
        });

        // Comment on original issue
        try {
          const comment = await gh.issues.createComment({
            owner: config.sourceRepo.owner,
            repo: config.sourceRepo.repo,
            issue_number: issue.number,
            body: config.transferComment(newIssue.data.html_url),
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
