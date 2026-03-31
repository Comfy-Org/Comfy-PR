#!/usr/bin/env bun --watch
import { db } from "@/src/db";
import { TaskMetaCollection } from "@/src/db/TaskMeta";
import { gh } from "@/lib/github";
import { ghPageFlow } from "@/src/ghPageFlow";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { normalizeGithubUrl } from "@/src/normalizeGithubUrl";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow from "sflow";
import sha256 from "sha256";
import { z } from "zod";
import { upsertSlackMessage } from "../gh-desktop-release-notification/upsertSlackMessage";
import { createTimeLogger } from "./createTimeLogger";
import {
  buildDesignCommentActivitySlackText,
  buildDesignRootSlackText,
  findLatestDesignSlackRootMessage,
  planDesignCommentNotification,
} from "./slackNotifications";
import { slackMessageUrlParse, slackMessageUrlStringify } from "./slackMessageUrlParse";
const tlog = createTimeLogger();

/**
 * Github Design Task
 * -----------------------
 * Task bot to scan for [Design] labels on PRs and issues and send notifications to product channel
 * 1. scan specified repos for issues/PRs with [Design] label
 * 2. send Slack notification to #product channel
 * 3. request review from specified reviewers for PRs
 * 4. track open/closed/merged/approved status
 * 5. store processed items in database to avoid duplicates
 */

// 1. scan these repos
const REPOURLS = [
  "https://github.com/Comfy-Org/ComfyUI_frontend",
  "https://github.com/Comfy-Org/desktop",
];

// 2. match these labels
const MATCH_LABELS = ["Design"];

// 3.1 request review from these users
const REQUEST_REVIEWERS = ["PabloWiedemann"];

// 3.2 notify to this slack channel
const CHANNEL_NAME = "product-design";

// Schema for GithubDesignTaskMeta validation
export const githubDesignTaskMetaSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),

  // task config, able to update via site web page
  // slackMessageTemplate: z.string().optional(),

  // cache
  lastRunAt: z.date().optional(),
  lastStatus: z.enum(["success", "error", "running"]).optional(),
  lastError: z.string().optional(),
});

type GithubDesignTask = {
  url: string; // the github Design issue/PR url

  // TODO: (sno) find a way to record approved state
  user: string; // user who created the issue/PR, github username
  state: "open" | "approved" | "closed" | "merged"; // for issues, only open/closed state is avaliable
  stateAt: Date; // state change time, for PRs this is the merge/close/open time, for issues this is the closed/open time
  type: "issue" | "pull_request";
  title: string; // title of the issue/PR
  bodyHash?: string; // hash of the body for change detection
  reviewers?: string[]; // requested reviewers for PRs, will be undefined for issues
  comments?: number; // number of comments on the issue/PR, for PRs this is the number of review comments
  labels: {
    name: string; // label name
    color: string; // label color
  }[]; // labels of the issue/PR

  // slack
  slackUrl?: string; // Slack message URL
  slackSentAt?: Date;
  slackMsgHash?: string; // hash of the Slack message for edit/update purposes
  slackCommentNotifiedCount?: number; // last discussion count announced in the Slack thread

  // task meta
  error?: string; // error message if unknown
  taskStatus?: "pending" | "done" | "error"; // task status
  lastRunAt?: Date; // last time this item was processed
  lastDoneAt?: Date | null; // last time this item was processed successfuly
};

// task states
const COLLECTION_NAME = "GithubDesignTask";
export const GithubDesignTaskMeta = TaskMetaCollection(COLLECTION_NAME, githubDesignTaskMetaSchema);
export const GithubDesignTask = db.collection<GithubDesignTask>(COLLECTION_NAME);

// Lazy index creation to avoid build-time execution
let _indexCreated = false;
async function ensureIndexes() {
  if (!_indexCreated) {
    await GithubDesignTask.createIndex({ url: 1 }, { unique: true }); // ensure url is unique
    _indexCreated = true;
  }
}

async function findGithubDesignTaskByUrl(url: string) {
  await ensureIndexes();
  const normalizedUrl = normalizeGithubUrl(url);
  const oldUrl = normalizedUrl.replace(/Comfy-Org/i, "comfyanonymous");
  return await GithubDesignTask.findOne({
    $or: [{ url: normalizedUrl }, { url: oldUrl }],
  });
}

// Helper function to save/update GithubDesignTask
async function saveGithubDesignTask(url: string, $set: Partial<GithubDesignTask>) {
  await ensureIndexes();
  // Normalize URLs to handle both comfyanonymous and Comfy-Org formats
  const normalizedUrl = normalizeGithubUrl(url);
  const normalizedSet = {
    ...$set,
    url: normalizedUrl,
    ...($set.slackUrl !== undefined && {
      slackUrl: normalizeGithubUrl($set.slackUrl),
    }),
  };

  // Incremental migration: Check both normalized and old URL formats
  const existing = await findGithubDesignTaskByUrl(url);

  return (
    (await GithubDesignTask.findOneAndUpdate(
      existing ? { _id: existing._id } : { url: normalizedUrl },
      { $set: normalizedSet },
      { upsert: true, returnDocument: "after" },
    )) || DIE("NEVER")
  );
}

if (import.meta.main) {
  await runGithubDesignTask();
  if (isCI) {
    await db.close();
    process.exit(0); // exit if running in CI
  }
}

/**
 * Run the Github Design Task
 * 1. List all open issues and PRs in specified repositories
 * 2. Filter by [Design] label
 * 3. Send Slack notification to channel #product
 * 4. PRs: request reviewer in PR (@PabloWiedemann)
 * 5. PRs: record open/merged/approve/closed status
 * 6. Issues: record open/closed status
 * 7. Store processed items in the database to avoid duplicates
 *
 * Note: This task is designed to run periodically to catch new design items.
 */
export async function runGithubDesignTask() {
  const dryRun = process.argv.includes("--dry");

  tlog("Running gh design task...");
  let meta = await GithubDesignTaskMeta.$upsert({
    name: "Github Design Issues Tracking Task",
    description:
      "Task to scan for [Design] labeled issues and PRs in specified repositories and notify product channel",
    // Set defaults if not already set
    //
    lastRunAt: new Date(),
    lastStatus: "running",
    lastError: "",
  });

  tlog("TaskMeta: " + JSON.stringify(meta));
  tlog(`Slack channel: ${CHANNEL_NAME}`);

  // Get configuration from meta or use defaults
  // const slackMessageTemplate = meta.slackMessageTemplate || DIE("Missing Slack message template");
  // console.log("Using Slack message template:", JSON.stringify(slackMessageTemplate));

  // Start processing design items
  const _designItemsFlow = await sflow(REPOURLS)
    .map((url) =>
      ghPageFlow(gh.issues.listForRepo)({
        ...parseGithubRepoUrl(url),
        labels: MATCH_LABELS.join(","), // comma-separated list of labels
        state: "open", // scan only opened issues/PRs
      }),
    )
    .confluenceByParallel() // merge page flows
    // simplify issue items
    .map((issue) => ({
      url: issue.html_url,
      title: issue.title,
      body: issue.body,
      user: issue.user?.login,
      type: issue.pull_request ? ("pull_request" as const) : ("issue" as const),
      state: issue.pull_request?.merged_at
        ? ("merged" as const)
        : (issue.state as "open" | "closed"),
      stateAt: issue.pull_request?.merged_at || issue.closed_at || issue.created_at,
      labels: issue.labels.flatMap((e) => (typeof e === "string" ? [] : [e])).map((l) => l.name),
      comments: issue.comments,
    }))
    .map(async function processIssueItems(issueInfo) {
      tlog(
        `PROCESSING ${issueInfo.url} #${issueInfo.title.replace(/\s+/g, "+")} ${issueInfo.body?.slice(0, 20).replaceAll(/\s+/g, "+")}`,
      );
      const url = issueInfo.url;
      const { owner, repo, issue_number } = parseIssueUrl(url);
      const existingTask = await findGithubDesignTaskByUrl(url);

      // create task
      let task = await saveGithubDesignTask(url, {
        type: issueInfo.type, // issue or pull_request
        state: issueInfo.state,
        stateAt: new Date(issueInfo.stateAt),
        title: issueInfo.title,
        user: issueInfo.user || "?",
        comments: issueInfo.comments || 0,
        bodyHash: issueInfo.body ? sha256(issueInfo.body) : undefined,
        lastRunAt: new Date(),
        taskStatus: "pending",
        lastDoneAt: null, // reset lastDoneAt
      });

      if (task.state === "open") {
        if (
          task.type === "pull_request" &&
          REQUEST_REVIEWERS.some((e) => !task.reviewers?.includes(e))
        ) {
          const requestReviewers = REQUEST_REVIEWERS;
          const newReviewers = requestReviewers.filter((e) => !task.reviewers?.includes(e));
          tlog(`Requesting reviewers: ${newReviewers.join(", ")}`);
          if (!dryRun) {
            await gh.pulls.requestReviewers({
              owner,
              repo,
              pull_number: issue_number,
              reviewers: newReviewers,
            });
            task = await saveGithubDesignTask(url, { reviewers: requestReviewers });
          }
        }

        const rootText = buildDesignRootSlackText({
          url: task.url,
          title: task.title,
          user: task.user,
          state: task.state,
          type: task.type,
        });
        const slackMsgHash = sha256(rootText);

        if (!task.slackUrl && existingTask && !dryRun) {
          const recovered = await findLatestDesignSlackRootMessage({
            channelName: CHANNEL_NAME,
            githubUrl: task.url,
          });
          if (recovered) {
            tlog(`Recovered existing Slack root message for task: ${task.url}`);
            task = await saveGithubDesignTask(url, {
              slackUrl: recovered.url,
              slackSentAt: existingTask?.slackSentAt ?? new Date(),
            });
          }
        }

        if (!task.slackUrl) {
          tlog(`Sending Slack Notification for design task: ${task.url} (${task.type})`);
          if (!dryRun) {
            const msg = await upsertSlackMessage({ channelName: CHANNEL_NAME, text: rootText });
            if (!msg.ok) {
              await saveGithubDesignTask(url, {
                error: `Failed to send Slack message: ${msg.error}`,
                taskStatus: "error",
              });
              throw new Error(`Failed to send Slack message: ${msg.error}`);
            }
            task = await saveGithubDesignTask(url, {
              slackUrl: slackMessageUrlStringify({ channel: msg.channel, ts: msg.ts! }),
              slackSentAt: new Date(),
              slackMsgHash,
              slackCommentNotifiedCount: task.comments,
            });
            tlog(`Slack message sent: ${task.slackUrl}`);
          }
        } else {
          if (task.slackMsgHash !== slackMsgHash) {
            tlog(`Updating Slack root message for task: ${task.url}`);
            if (!dryRun) {
              await upsertSlackMessage({
                ...slackMessageUrlParse(task.slackUrl),
                text: rootText,
              });
              task = await saveGithubDesignTask(url, { slackMsgHash });
              tlog(`Slack message updated: ${task.slackUrl}`);
            }
          }

          const commentNotificationPlan = planDesignCommentNotification(
            existingTask?.slackCommentNotifiedCount,
            task.comments,
          );

          if (commentNotificationPlan.shouldReplyInThread && !dryRun) {
            const previousComments = existingTask?.slackCommentNotifiedCount ?? 0;
            const slackUrl = task.slackUrl || DIE(`Missing slackUrl for design task: ${task.url}`);
            const activityText = buildDesignCommentActivitySlackText(
              {
                url: task.url,
                title: task.title,
                type: task.type,
              },
              previousComments,
              task.comments ?? previousComments,
            );

            tlog(`Posting threaded design discussion update for task: ${task.url}`);
            await upsertSlackMessage({
              channel: slackMessageUrlParse(slackUrl).channel,
              text: activityText,
              replyUrl: slackUrl,
            });
          }

          if (
            existingTask?.slackCommentNotifiedCount !== commentNotificationPlan.nextNotifiedComments
          ) {
            task = await saveGithubDesignTask(url, {
              slackCommentNotifiedCount: commentNotificationPlan.nextNotifiedComments,
              ...(task.slackMsgHash === slackMsgHash ? {} : { slackMsgHash }),
            });
          }
        }
      }
      // msgUrl = https://comfy-organization.slack.com/archives/C095SJWUYMR/p1752606379600379
      // msgUrl https://comfy-organization.slack.com/archives/C07G75QB06Q/p1752605541508469
      if (!dryRun) {
        await saveGithubDesignTask(url, {
          lastDoneAt: new Date(),
          taskStatus: "done",
        });
        tlog(`Task ${task.url} processed and stored in database.`);
      }
    }) // concurrency 3 repos
    .run();

  tlog("Github Design Task completed successfully.");
  await GithubDesignTaskMeta.$upsert({
    lastRunAt: new Date(),
    lastStatus: "success",
    lastError: "",
  });
}
