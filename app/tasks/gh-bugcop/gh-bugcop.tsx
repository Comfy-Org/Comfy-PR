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
import { parseUrlRepoOwner } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import chalk from "chalk";
import { compareBy } from "comparing";
import fastDiff from "fast-diff";
import hotMemo from "hot-memo";
import isCI from "is-ci";
import { difference, union } from "rambda";
import sflow, { pageFlow } from "sflow";
import z from "zod";
import { createTimeLogger } from "../gh-design/createTimeLogger";
// import Lock from 'async-sema';
// import deferClose from "defer-close";
export const REPOLIST = [
  "https://github.com/Comfy-Org/Comfy-PR",
  "https://github.com/comfyanonymous/ComfyUI",
  "https://github.com/Comfy-Org/ComfyUI_frontend",
  "https://github.com/Comfy-Org/desktop",
];
export const ASKING_LABEL = "bug-cop:ask-for-info";
// export const ANSWERED_LABEL = "bug-cop:answered"; // 2025-08-09 “answered” is never managed by bot
export const RESPONSE_RECEIVED_LABEL = "bug-cop:response-received";
export const GithubBugcopTaskDefaultMeta = {
  repoUrls: REPOLIST,
  matchLabel: [ASKING_LABEL],
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
export const GithubBugcopTaskMeta = TaskMetaCollection("GithubBugcopTask", zGithubBugcopTaskMeta);
export const GithubBugcopTask = db.collection<GithubBugcopTask>("GithubBugcopTask");

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
  const openningIssues = await sflow(REPOLIST)
    // list issues for each repo
    .map((repoUrl) => {
      tlog(`Fetching issues for ${repoUrl}...`);
      return pageFlow(1, async (page) => {
        const { data: issues } = await hotMemo(gh.issues.listForRepo, [
          {
            ...parseUrlRepoOwner(repoUrl),
            state: "open" as const,
            page,
            per_page: 100,
            labels: ASKING_LABEL,
          },
        ]);
        tlog(`Found ${issues.length} matched issues in ${repoUrl}`);
        return { data: issues, next: issues.length >= 100 ? page + 1 : undefined };
      }).flat();
    })
    .confluenceByParallel() // unpack pageFlow, order does not matter, so we can run in parallel
    .forEach(processIssue)
    .toArray();

  tlog(`Processed ${openningIssues.length} open issues with label "${ASKING_LABEL}"`);

  // once openning issues are processed,
  // now we should process the issues in db that's not openning anymore
  await sflow(
    GithubBugcopTask.find({
      url: { $nin: openningIssues.map((e) => e.html_url) },
    }),
  )
    .map((task) => task.url)
    .log()
    .map(async (issueUrl) => await hotMemo(gh.issues.get, [{ ...parseIssueUrl(issueUrl) }]).then((e) => e.data))
    // .log()
    .forEach(processIssue)
    .run();

  tlog(chalk.green("Github Bugcop Task completed successfully!"));
}

async function processIssue(issue: GH["issue"]) {
  const url = issue.html_url; // ?? ("issue.html_url is required")    ;
  const issueId = parseIssueUrl(issue.html_url); // = {owner, repo, issue_number}
  let task = await GithubBugcopTask.findOne({ url });
  const saveTask = async (data: Partial<GithubBugcopTask>) =>
    (task =
      (await GithubBugcopTask.findOneAndUpdate({ url }, { $set: data }, { returnDocument: "after", upsert: true })) ||
      DIE("never"));
  task = await saveTask({
    taskStatus: "processing",
    user: issue.user?.login,
    labels: issue.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean),
    updatedAt: new Date(issue.updated_at),
  });

  if (issue.state === "closed") {
    await saveTask({
      status: "closed",
      statusReason: "issue closed",
      updatedAt: new Date(issue.updated_at),
      lastChecked: new Date(),
    });
    return;
  }

  // check if the issue body is updated since last successful scan
  if (!task.body) await saveTask({ body: issue.body ?? undefined });
  const isBodyAddedContent =
    issue.body &&
    task.body &&
    issue.body !== task.body &&
    fastDiff(task.body ?? "", issue.body ?? "").filter(([op, val]) => op === fastDiff.INSERT).length > 0; // check if the issue body has added new content after the label added time

  tlog(chalk.bgBlackBright("Issue: " + issue.html_url));

  const timeline = await pageFlow(1, async (page) => {
    const { data: events } = await hotMemo(gh.issues.listEventsForTimeline, [
      {
        ...issueId,
        page,
        per_page: 100,
      },
    ]);
    return { data: events, next: events.length >= 100 ? page + 1 : undefined };
  })
    // flat
    .filter((e) => e.length)
    .by((s) => s.pipeThrough(flats()))
    .toArray();

  // list all label events
  const labelEvents = await sflow([...timeline])
    .forEach((_e) => {
      if (_e.event === "labeled") {
        const e = _e as GH["labeled-issue-event"];
        // tlog(`#${issue.number} ${new Date(e.created_at).toISOString()} @${e.actor.login} + label:${e.label.name}`);
        return e;
      }
      if (_e.event === "unlabeled") {
        const e = _e as GH["unlabeled-issue-event"];
        // tlog(`#${issue.number} ${new Date(e.created_at).toISOString()} @${e.actor.login} - label:${e.label.name}`);
        return e;
      }
      if (_e.event === "commented") {
        const e = _e as GH["timeline-comment-event"];
        // tlog(`#${issue.number} ${new Date(e.created_at).toISOString()} @${e.actor?.login} ${e.body?.slice(0, 20)}`);
        return e;
      }

      tlog(`#${issue.number} ${new Date((_e as any).created_at ?? new Date()).toISOString()} ? ${_e.event}`);
      // ignore other events
    })
    .toArray();
  // tlog("Found " + labelEvents.length + " timeline events");
  await saveTask({ timeline: labelEvents as any });

  const latestLabeledEvent =
    labelEvents
      .filter((e) => e.event === "labeled")
      .map((e) => e as GH["labeled-issue-event"])
      .filter((e) => e.label?.name === ASKING_LABEL)
      .sort(compareBy((e) => e.created_at))
      .reverse()[0] ||
    DIE("No labeled event found, this should not happen since we are filtering issues by this label");
  // last added time of this label
  const labelLastAddedTime = new Date(latestLabeledEvent?.created_at);
  tlog('Last added time of label "' + ASKING_LABEL + '" is ' + labelLastAddedTime.toISOString());

  // checkif it's answered
  const hasNewComment = await (async function () {
    // 1. list issue comments that is updated/created later than this label last added
    const newComments = await pageFlow(1, async (page) => {
      const { data: comments } = await hotMemo(gh.issues.listComments.bind(gh.issues), [
        { ...issueId, page, per_page: 100 },
      ]);
      return { data: comments, next: comments.length >= 100 ? page + 1 : undefined };
    })
      .filter((page) => page.length)
      .flat()
      .filter((e) => e.user) // filter out comments without user
      .filter((e) => !e.user?.login.match(/\[bot\]$|-bot/)) // no bots
      .filter((e) => !["COLLABORATOR", "CONTRIBUTOR", "MEMBER", "OWNER"].includes(e.author_association)) // not by collaborators, usually askForInfo for more info
      .filter((e) => e.user?.login !== latestLabeledEvent.actor.login) // ignore the user who added the label
      .filter((e) => +new Date(e.updated_at) > +new Date(labelLastAddedTime)) // only comments that is updated later than the label added time
      .toArray();
    newComments.length && tlog("Found " + newComments.length + " comments after last added time for " + issue.html_url);
    // tlog("Found " + JSON.stringify(comments));
    return !!newComments.length;
  })();

  // TODO: maybe search in notion db about this issue, if it's answered in notion, then mark as answered
  // tlog('issue body not updated after last added time, checking comments...');

  const responseReceived = hasNewComment || isBodyAddedContent; // check if user responsed info by new comment or body update
  const status: "responseReceived" | "askForInfo" = responseReceived ? "responseReceived" : "askForInfo";
  const workinglabels = [ASKING_LABEL, RESPONSE_RECEIVED_LABEL];
  const labelSet = {
    responseReceived: [RESPONSE_RECEIVED_LABEL],
    askForInfo: [ASKING_LABEL],
    closed: [], // clear bug-cop labels
  }[status];

  const currentLabels = issue.labels
    .filter((l) => l != null)
    .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
    .filter(Boolean);
  const addLabels = difference(labelSet, currentLabels);
  const removeLabels = difference(
    currentLabels.filter((label) => workinglabels.includes(label)),
    labelSet,
  );

  tlog(`Issue ${issue.html_url}`);
  tlog(
    `>> status: ${status}, labels: ${chalk.bgBlue([...addLabels.map((e) => "+ " + e), ...removeLabels.map((e) => "- " + e)].join(", "))}`,
  );

  if (isDryRun) return;

  await sflow(addLabels)
    .forEach((label) => tlog(`Adding label ${label} to ${issue.html_url}`))
    .map((label) => gh.issues.addLabels({ ...issueId, labels: [label] }))
    .run();
  await sflow(removeLabels)
    .forEach((label) => tlog(`Removing label ${label} from ${issue.html_url}`))
    .map((label) => gh.issues.removeLabel({ ...issueId, name: label }))
    .run();

  // update task status
  await saveTask({
    status,
    statusReason: isBodyAddedContent ? "body updated" : hasNewComment ? "new comment" : "unknown",
    taskStatus: "ok",
    taskAction: [...addLabels.map((e) => "+ " + e), ...removeLabels.map((e) => "- " + e)].join(", "),
    lastChecked: new Date(),
    labels: union(task.labels || [], addLabels).filter((e) => !removeLabels.includes(e)),
  });
}
function flats<T>(): TransformStream<T[], T> {
  return new TransformStream<T[], T>({
    transform: (e, controller) => {
      e.forEach((event) => controller.enqueue(event));
    },
    flush: (controller) => {
      // No finalization needed
      // Stream will be closed automatically after flush
    },
  });
}
