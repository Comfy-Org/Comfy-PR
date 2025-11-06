#!/usr/bin/env bun
import { tsmatch } from "@/packages/mongodb-pipeline-ts/Task";
import { db } from "@/src/db";
import { MetaCollection } from "@/src/db/TaskMeta";
import { gh, type GH } from "@/src/gh";
import { ghc } from "@/src/ghc";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import chalk from "chalk";
import sflow, { pageFlow } from "sflow";
import z from "zod";
/**
 * Label Ops System
 *
 * In any of those repos:
 * https://github.com/Comfy-Org/Comfy-PR
 * https://github.com/comfyanonymous/ComfyUI
 * https://github.com/Comfy-Org/ComfyUI_frontend
 * https://github.com/Comfy-Org/desktop
 *
 * User can add comments to manipulate Issue/PR labels by a simple syntax, without require permissions on repo .
 * Add a label: Send a comment with "+label:[name]" (must have no space)
 * Remove a label: Send a comment with "-label:[name]" (must have no space)
 *
 */

const cfg = {
  REPOLIST: [
    "https://github.com/comfyanonymous/ComfyUI",
    // "https://github.com/Comfy-Org/Comfy-PR", // handled by webhook
    // "https://github.com/Comfy-Org/ComfyUI_frontend", // handled by webhook
    // "https://github.com/Comfy-Org/desktop", // handled by webhook
  ],
  allow: [
    // allow all users to edit bugcop:*, area:*, Core-*, labels
    /^(?:Core|Core-.*)$/i,
    /^(?:bug-cop|area):.*$/i,
    // allow all users to edit issue transfer labels
    /frontend|desktop/i,
  ],
};
type GithubIssueLabelOps = {
  target_url: string; // can be comment or issue
  issue_url: string; // issue
  type: "issue" | "issue-comment";

  processed_at?: Date; // for diff
  task_updated_at?: Date;
};

const GithubIssueLabelOps = db.collection<GithubIssueLabelOps>("GithubIssueLabelOps");
await GithubIssueLabelOps.createIndex({ target_url: 1 }, { unique: true });
const Meta = MetaCollection(
  GithubIssueLabelOps,
  z.object({
    repolist: z.string().array(),
    /**
     * The checkpoint time for last processed issue update
     * Used to avoid re-processing old comments
     * @description Stored as Date Object in MongoDB
     *
     * @example 2024-06-01T12:34:56.789Z
     *
     */
    checkpoint: z.date().optional(),
    allow: z.string().array(),
  }),
);

const saveTask = async (task: Partial<GithubIssueLabelOps> & { target_url: string }) =>
  (await GithubIssueLabelOps.findOneAndUpdate(
    { target_url: task.target_url },
    { $set: { ...task, task_updated_at: new Date() } },
    { upsert: true, returnDocument: "after" },
  )) || DIE("fail to save task");

if (import.meta.main) {
  // const issueCommentUrl = 'https://github.com/comfyanonymous/ComfyUI/issues/10522#issuecomment-3459764591'
  // const issue = await ghc.issues.get({ ...parseIssueUrl(issueCommentUrl) });
  // const comment = await ghc.issues.getComment({ ...parseIssueUrl(issueCommentUrl), comment_id: issueCommentUrl.match(/\d+$/).at(0) });
  // await processIssueCommentForLableops({ issue: issue.data, comment: comment.data })
  //   .then(tap(console.log))
  // await runLabelOpInitializeScan();
  await runLabelOpPolling();
  console.log("done");
}
async function runLabelOpPolling() {
  console.log(chalk.bgBlue("Start Label Ops Polling..."));
  const { checkpoint } = await Meta.save({
    repolist: cfg.REPOLIST,
    allow: cfg.allow.map((e) => e.source),
  });
  // every 5s, check recent new comments for repo for 1min
  while (true) {
    console.log(chalk.blue("Checking new issue comments since ", checkpoint?.toISOString() ?? "the beginning"));
    await sflow(cfg.REPOLIST)
      .map((repoUrl) =>
        pageFlow(1, async (page, per_page = 100) => {
          console.log(`Listing issue comments for recent updates in ${repoUrl} page ${page}`);
          const { data } = await gh.issues.listCommentsForRepo({
            ...parseGithubRepoUrl(repoUrl),
            page,
            per_page,
            since: checkpoint?.toISOString() ?? undefined, // updated comments in last 5min
            sort: "updated",
            direction: "asc",
          });
          return { data, next: data.length >= per_page ? page + 1 : null };
        }).flat(),
      )
      .confluenceByParallel()
      .forEach(async (comment) => {
        console.log(comment.html_url);
        const issue = await ghc.issues.get({ ...parseIssueUrl(comment.html_url) });
        await processIssueCommentForLableops({ issue: issue.data, comment });
        await Meta.$upsert({
          checkpoint: issue.data.updated_at ? new Date(issue.data.updated_at) : DIE("missing updated_at in issue"),
        });
      })
      .run();
    console.log(chalk.blue("Sleep 5s"));
    await new Promise((r) => setTimeout(r, 5000));
  }
}
/**
 * Scan all issues/prs and it's comments, and process them for label operations.
 *
 * this is necessary to run this to catch the missed events when webhook server is down and up again
 *
 * It's safe to run multiple time as it's idempotent.
 *
 */
async function runLabelOpInitializeScan() {
  console.log(chalk.bgBlue("Start Label Ops Initialization Scan..."));
  await sflow(cfg.REPOLIST)
    .map((repoUrl) =>
      pageFlow(1, async (page, per_page = 100) => {
        console.log(`Listing issues for ${repoUrl} page ${page}`);
        const { data } = await ghc.issues.listForRepo({
          ...parseGithubRepoUrl(repoUrl),
          page,
          per_page,
          state: "open",
        });
        console.log(`Fetched ${data.length} issues from ${repoUrl} page ${page}`);
        return { data, next: data.length >= per_page ? page + 1 : null };
      }).flat(),
    )
    .confluenceByParallel()
    .map(async (issue) => {
      console.log(`+issue ${issue.html_url} with ${issue.comments} comments`);
      if (!issue.comments) return;
      await pageFlow(1, async (page, per_page = 100) => {
        const { data } = await ghc.issues.listComments({ ...parseIssueUrl(issue.html_url), page, per_page });
        return { data, next: data.length >= per_page ? page + 1 : null };
      })
        .flat()
        .forEach((comment) => processIssueCommentForLableops({ issue, comment }))
        .run();
    })
    .run();
  console.log(chalk.bgBlue("Label Ops Polling Done."));
}

/**
 * Note: can also process pull_requests
 */
export async function processIssueCommentForLableops({
  issue,
  comment,
}: {
  issue: GH["issue"];
  comment?: GH["issue-comment"] | null;
}) {
  const target = comment || issue;
  console.log("  +COMMENT " + target.html_url + " len:" + target.body?.length);
  let task = await saveTask({
    target_url: target.html_url,
    issue_url: issue.html_url,
    type: comment ? "issue-comment" : "issue",
  });
  if (!target.body) return task;
  const issueLabels = issue.labels.map((e) => (typeof e === "string" ? e : e.name));
  const labelOps = [...target.body.matchAll(/([+-])label:\s*?(\S+)\b/gim)]
    .map(([_, op, name]) => ({ op, name }))
    .filter(({ op, name }) => {
      // skip already added/removed in issueLables
      if (op === "+" && issueLabels.includes(name)) return false;
      if (op === "-" && !issueLabels.includes(name)) return false;
      // skip not allowed labels
      if (op === "+" && !cfg.allow.some((pattern) => name.match(pattern))) {
        console.warn("WARNING: trying to edit not allowed label ", { op, name });
        return false;
      }
      if (op === "-" && !cfg.allow.some((pattern) => name.match(pattern))) {
        console.warn("WARNING: trying to edit not allowed label ", { op, name });
        return false;
      }
      return true;
    });

  if (task?.processed_at && +new Date(target.updated_at) <= +task.processed_at) return null; // skip if processed
  if (!labelOps.length) return saveTask({ target_url: target.html_url, processed_at: new Date() });

  console.log("Found a matched Target URL:", target.html_url, labelOps.map((e) => e.op + e.name).join(", "));

  // return task;
  console.log(chalk.blue("Adding reaction"));
  if (comment === target) {
    await gh.reactions.createForIssueComment({
      ...parseIssueUrl(issue.html_url),
      comment_id: comment.id,
      content: "eyes",
    });
  } else {
    await gh.reactions.createForIssue({ ...parseIssueUrl(issue.html_url), content: "eyes" });
  }
  //
  console.log("+- Labels");
  await sflow(labelOps)
    .forEach(async ({ op, name }) => {
      console.log(chalk.bgBlue(`${op} label: ${name}`));
      return await tsmatch(op)
        .with("+", async () => await gh.issues.addLabels({ ...parseIssueUrl(issue.html_url), labels: [name] })) // todo: merge multiple addLabels for performance
        .with("-", async () => await gh.issues.removeLabel({ ...parseIssueUrl(issue.html_url), name }))
        .otherwise(() => DIE(`Unknown label op ${op}, should never happen`));
    })
    .run();
  console.log("Done");
  return saveTask({ target_url: target.html_url, processed_at: new Date() });
}
