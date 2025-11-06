#!/usr/bin/env bun --watch
/**
 * Github Bugcop Bot
 * 1. bot matches issues for label "bug-cop:ask-for-info"
 * 2. if user have added context, remove "bug-cop:ask-for-info" and add "bug-cop:response-received"
 */

// for repo
import { db } from "@/src/db";
import { TaskMetaCollection } from "@/src/db/TaskMeta";
import { gh, type GH } from "@/src/gh";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import KeyvSqlite from "@keyv/sqlite";
import DIE from "@snomiao/die";
import chalk from "chalk";
import { compareBy } from "comparing";
import fastDiff from "fast-diff";
import { mkdir } from "fs/promises";
import hotMemo from "hot-memo";
import isCI from "is-ci";
import Keyv from "keyv";
import { union } from "rambda";
import sflow, { pageFlow } from "sflow";
import z from "zod";
import { createTimeLogger } from "../../app/tasks/gh-design/createTimeLogger";
export const REPOLIST = [
  "https://github.com/Comfy-Org/Comfy-PR",
  "https://github.com/comfyanonymous/ComfyUI",
  "https://github.com/Comfy-Org/ComfyUI_frontend",
  "https://github.com/Comfy-Org/desktop",
];
await mkdir("./.cache", { recursive: true });
const kv = new Keyv({ store: new KeyvSqlite("sqlite://.cache/bugcop-cache.sqlite") });
function createKeyvCachedFn<FN extends (...args: any[]) => Promise<unknown>>(key: string, fn: FN): FN {
  return (async (...args) => {
    const mixedKey = key + "(" + JSON.stringify(args) + ")";
    if (await kv.has(mixedKey)) return await kv.get(mixedKey);
    const ret = await fn(...args);
    await kv.set(mixedKey, ret);
    return ret;
  }) as FN;
}
export const BUGCOP_ASKING_FOR_INFO = "bug-cop:ask-for-info" as const; // asking user for more info
export const BUGCOP_ANSWERED = "bug-cop:answered" as const; // an issue is answered by ComfyOrg Team member
export const BUGCOP_RESPONSE_RECEIVED = "bug-cop:response-received" as const; // user has responded ask-for-info or answered label
export const GithubBugcopTaskDefaultMeta = {
  repoUrls: REPOLIST,
  matchLabel: [BUGCOP_ASKING_FOR_INFO],
};

export type GithubBugcopTask = {
  url: string; // the issue URL

  status?: // | "ask-for-info" // deprecated, use "askForInfo" instead, this may still in db
  // | "answered"  // deprecated, use "responseReceived" instead, this may still in db

  | "askForInfo" // user has not answered yet, but we have ask-for-info label
    | "responseReceived" // user has answered the issue, so we can remove the askForInfo
    | "closed"; // issue is closed, so we can remove all bug-cop labels
  statusReason?: string; // reason for the status, for example, "no new comments" or "body updated"
  updatedAt?: Date; // the last updated time of the issue, for diff checking

  body?: string; // body of the issue, for diff checking

  // caches
  user?: string; // the user who created the issue
  labels?: string[]; // labels of the issue, just cache
  timeline?: (GH["labeled-issue-event"] | GH["timeline-comment-event"] | GH["unlabeled-issue-event"])[]; // timeline events of the issue, just cache

  // task status for task scheduler
  taskStatus?: "processing" | "ok" | "error";
  taskAction?: string; // if processing, can be use for rollback or undo
  lastChecked?: Date; // last updated time of the issue
};
export const zGithubBugcopTaskMeta = z.object({
  repoUrls: z.url().array(),
});
export const GithubBugcopTask = db.collection<GithubBugcopTask>("GithubBugcopTask");
export const GithubBugcopTaskMeta = TaskMetaCollection("GithubBugcopTask", zGithubBugcopTaskMeta);

const tlog = createTimeLogger();
const isDryRun = process.env.DRY_RUN === "true" || process.argv.slice(2).includes("--dry");

if (import.meta.main) {
  await runGithubBugcopTask();
  if (isCI) {
    await db.close();
    process.exit();
  }
}

export default async function runGithubBugcopTask() {
  tlog("Running Github Bugcop Task...");
  const matchingLabels = [BUGCOP_ASKING_FOR_INFO, BUGCOP_ANSWERED];
  const openningIssues = await sflow(REPOLIST)
    // list issues for each repo
    .flatMap((repoUrl) =>
      matchingLabels.map((label) =>
        pageFlow(1, async (page) => {
          const { data: issues } = await hotMemo(gh.issues.listForRepo, [
            {
              ...parseGithubRepoUrl(repoUrl),
              state: "open" as const,
              page,
              per_page: 100,
              labels: label,
            },
          ]);
          tlog(`Found ${issues.length} ${label} issues in ${repoUrl}`);
          return { data: issues, next: issues.length >= 100 ? page + 1 : undefined };
        }).flat(),
      ),
    )
    .confluenceByParallel() // unpack pageFlow, order does not matter, so we can run in parallel
    .forEach(processIssue)
    .toArray();

  tlog(`Processed ${openningIssues.length} open issues`);

  // once openning issues are processed,
  // now we should process the issues in db that's not openning anymore
  const existingTasks = await sflow(
    GithubBugcopTask.find({
      url: { $nin: openningIssues.map((e) => e.html_url) },
    }),
  )
    .map((task) => task.url)
    .map(async (issueUrl) => await hotMemo(gh.issues.get, [{ ...parseIssueUrl(issueUrl) }]).then((e) => e.data))
    .forEach(processIssue)
    .toArray();

  tlog(chalk.green("Processed " + existingTasks.length + " existing tasks that are not openning/labeled anymore"));

  tlog(chalk.green("All Github Bugcop Task completed successfully!"));
}

async function processIssue(issue: GH["issue"]) {
  const url = issue.html_url;
  const issueId = parseIssueUrl(issue.html_url);
  let task = await GithubBugcopTask.findOne({ url });
  const saveTask = async (data: Partial<GithubBugcopTask>) =>
    (task =
      (await GithubBugcopTask.findOneAndUpdate(
        { url },
        { $set: { updatedAt: new Date(), ...data } },
        { returnDocument: "after", upsert: true },
      )) || DIE("never"));

  const issueLabels = issue.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean);
  task = await saveTask({
    taskStatus: "processing",
    user: issue.user?.login,
    labels: issueLabels,
    updatedAt: new Date(issue.updated_at),
  });

  if (issue.state === "closed") {
    if (task.status !== "closed") {
      tlog(chalk.bgRedBright("Issue is closed: " + issue.html_url));
    }
    return await saveTask({ status: "closed", lastChecked: new Date() });
  }

  // check if the issue body is updated since last successful scan
  if (!task.body) await saveTask({ body: issue.body ?? undefined });
  const isBodyAddedContent =
    issue.body &&
    task.body &&
    issue.body !== task.body &&
    fastDiff(task.body ?? "", issue.body ?? "").filter(([op, val]) => op === fastDiff.INSERT).length > 0; // check if the issue body has added new content after the label added time

  tlog(chalk.bgBlackBright("Processing Issue: " + issue.html_url));
  tlog(chalk.bgBlue("Labels: " + JSON.stringify(issueLabels)));

  const timeline = await fetchAllIssueTimeline(issueId);

  // list all label events
  const labelEvents = await sflow([...timeline])
    .map((_e) => {
      return _e.event === "labeled" || _e.event === "unlabeled" || _e.event === "commented"
        ? (_e as GH["labeled-issue-event"] | GH["unlabeled-issue-event"] | GH["timeline-comment-event"])
        : null;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .toArray();
  tlog("Found " + labelEvents.length + " unlabeled/labeled/commented events");
  await saveTask({ timeline: labelEvents as any });

  function lastLabeled(labelName: string) {
    return labelEvents
      .filter((e) => e?.event === "labeled")
      .map((e) => e as GH["labeled-issue-event"])
      .filter((e) => e.label?.name === labelName)
      .sort(compareBy((e) => e.created_at))
      .reverse()[0];
  }

  const latestLabeledEvent = lastLabeled(BUGCOP_ASKING_FOR_INFO) || lastLabeled(BUGCOP_ANSWERED);
  if (!latestLabeledEvent) {
    lastLabeled(BUGCOP_RESPONSE_RECEIVED) ||
      DIE(
        new Error(
          `No labeled event found, this should not happen since we are filtering issues by those label, ${JSON.stringify(task.labels)}`,
        ),
      );
    return task;
  }

  // check if it's answered since lastLabel
  const hasNewComment = await (async function () {
    const labelLastAddedTime = new Date(latestLabeledEvent?.created_at);
    const newComments = await pageFlow(1, async (page) => {
      const { data: comments } = await hotMemo(gh.issues.listComments, [{ ...issueId, page, per_page: 100 }]);
      return { data: comments, next: comments.length >= 100 ? page + 1 : undefined };
    })
      .flat()
      .filter((e) => e.user) // filter out comments without user
      .filter((e) => !e.user?.login.match(/\[bot\]$|-bot/)) // no bots
      .filter((e) => +new Date(e.updated_at) > +new Date(labelLastAddedTime)) // only comments that is updated later than the label added time
      .filter((e) => !["COLLABORATOR", "CONTRIBUTOR", "MEMBER", "OWNER"].includes(e.author_association)) // not by collaborators, usually askForInfo for more info
      .filter((e) => e.user?.login !== latestLabeledEvent.actor.login) // ignore the user who added the label
      .toArray();
    newComments.length &&
      tlog(chalk.bgGreen("Found " + newComments.length + " comments after last added time for " + issue.html_url));
    return !!newComments.length;
  })();

  const isResponseReceived = hasNewComment || isBodyAddedContent; // check if user responsed info by new comment or body updated since last scanned
  if (!isResponseReceived) {
    return await saveTask({
      taskStatus: "ok",
      lastChecked: new Date(),
    });
  }

  const addLabels = [BUGCOP_RESPONSE_RECEIVED].filter((e) => !issueLabels.includes(e)); // add response received label if not already added
  const removeLabels = [latestLabeledEvent.label.name].filter((e) => issueLabels.includes(e)); // remove the triggering label if it exists on the issue

  if (isResponseReceived) {
    console.log(chalk.bgBlue("Adding:"), addLabels);
    console.log(chalk.bgBlue("Removing:"), removeLabels);
  }

  if (isDryRun) return task;

  await sflow(addLabels)
    .forEach((label) => tlog(`Adding label ${label} to ${issue.html_url}`))
    .map((label) => gh.issues.addLabels({ ...issueId, labels: [label] }))
    .run();
  await sflow(removeLabels)
    .forEach((label) => tlog(`Removing label ${label} from ${issue.html_url}`))
    .map((label) => gh.issues.removeLabel({ ...issueId, name: label }))
    .run();

  return await saveTask({
    // status,
    statusReason: isBodyAddedContent ? "body updated" : hasNewComment ? "new comment" : "unknown",
    taskStatus: "ok",
    lastChecked: new Date(),
    labels: union(task.labels || [], addLabels).filter((e) => !removeLabels.includes(e)),
  });
}

async function fetchAllIssueTimeline(issueId: { owner: string; repo: string; issue_number: number }) {
  return await pageFlow(1, async (page, size = 100) => {
    const { data: events } = await createKeyvCachedFn("gh.issues.listEventsForTimeline", (...args) =>
      gh.issues.listEventsForTimeline(...args),
    )({ ...issueId, page, per_page: size });
    console.log("Fetched " + JSON.stringify({ ...issueId, page, per_page: size, events: events.length }) + " events");
    return { data: events, next: events.length >= size ? page + 1 : undefined };
  })
    .flat()
    .toArray();
}
