import { db } from "@/src/db";
import { TaskMetaCollection } from "@/src/db/TaskMeta";
import { gh } from "@/src/gh";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { getSlack } from "@/src/slack";
import { getSlackChannel } from "@/src/slack/channels";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow, { pageFlow } from "sflow";
import sha256 from "sha256";
import { z } from "zod";
import { createTimeLogger } from "./createTimeLogger";
import { ghDesignDefaultConfig } from "./default-config";
import { slackMessageUrlParse, slackMessageUrlStringify } from "./slackMessageUrlParse";
const tlog = createTimeLogger();
// Task bot to scan for [Design] labels on PRs and issues and send notifications to product channel

// Schema for GithubDesignTaskMeta validation
export const githubDesignTaskMetaSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),

  // task config
  slackChannelName: z.string().optional(),
  slackMessageTemplate: z.string().optional(),
  repoUrls: z.array(z.string().url()).optional(),
  requestReviewers: z.array(z.string()).optional(),
  matchLabels: z.string().optional(),

  // cache
  slackChannelId: z.string().optional(),
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

  // task meta
  error?: string; // error message if any
  taskStatus?: "pending" | "done" | "error"; // task status
  lastRunAt?: Date; // last time this item was processed
  lastDoneAt?: Date | null; // last time this item was processed successfuly
};

// task states
const COLLECTION_NAME = "GithubDesignTask";
export const GithubDesignTaskMeta = TaskMetaCollection(COLLECTION_NAME, githubDesignTaskMetaSchema);
export const GithubDesignTask = db.collection<GithubDesignTask>(COLLECTION_NAME);
await GithubDesignTask.createIndex({ url: 1 }, { unique: true }); // ensure url is unique

// Helper function to save/update GithubDesignTask
async function saveGithubDesignTask(url: string, $set: Partial<GithubDesignTask>) {
  return (
    (await GithubDesignTask.findOneAndUpdate({ url }, { $set }, { upsert: true, returnDocument: "after" })) ||
    DIE("NEVER")
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
    slackChannelId: "",
    //
    lastRunAt: new Date(),
    lastStatus: "running",
    lastError: "",
  });

  // save default values if not set
  if (!meta.slackMessageTemplate)
    meta = await GithubDesignTaskMeta.$upsert({ slackMessageTemplate: ghDesignDefaultConfig.SLACK_MESSAGE_TEMPLATE });
  if (!meta.requestReviewers)
    meta = await GithubDesignTaskMeta.$upsert({ requestReviewers: ghDesignDefaultConfig.REQUEST_REVIEWERS });
  if (!meta.repoUrls) meta = await GithubDesignTaskMeta.$upsert({ repoUrls: ghDesignDefaultConfig.REPOS_TO_SCAN_URLS });
  if (!meta.matchLabels) meta = await GithubDesignTaskMeta.$upsert({ matchLabels: ghDesignDefaultConfig.MATCH_LABEL });
  if (!meta.slackChannelName)
    meta = await GithubDesignTaskMeta.$upsert({ slackChannelName: ghDesignDefaultConfig.SLACK_CHANNEL_NAME });
  if (!meta.slackChannelId) {
    tlog("Fetching Slack product channel...");
    meta = await GithubDesignTaskMeta.$upsert({
      slackChannelId: (await getSlackChannel(meta.slackChannelName!)).id,
    });
  }

  tlog("TaskMeta: " + JSON.stringify(meta));

  const channel = meta.slackChannelId || DIE("Missing Slack channel ID");
  tlog(`Slack channel: ${meta.slackChannelName} (${channel})`);

  // Get configuration from meta or use defaults
  const slackMessageTemplate = meta.slackMessageTemplate || DIE("Missing Slack message template");
  const designItemsFlow = await sflow(meta.repoUrls || DIE("Missing repo URLs"))
    .map((e) => parseGithubRepoUrl(e))
    .pMap(
      async ({ owner, repo }) =>
        pageFlow(1, async (page) => {
          const per_page = 100;
          // will list both issues and PRs
          const { data: issues } = await gh.issues.listForRepo({
            owner,
            repo,
            page,
            per_page,
            labels: meta.matchLabels || DIE("missing match label"), // comma-separated list of labels
            state: "open", // scan only opened issues/PRs
          });
          tlog(`Found ${issues.length} Design labeled items in ${owner}/${repo}`);
          return { data: issues, next: issues.length >= per_page ? page + 1 : undefined };
        })
          .filter((e) => e.length)
          .flat()
          .map((item) => ({
            url: item.html_url,
            title: item.title,
            body: item.body,
            user: item.user?.login,
            type: item.pull_request ? ("pull_request" as const) : ("issue" as const),
            state: item.pull_request?.merged_at ? ("merged" as const) : (item.state as "open" | "closed"),
            stateAt: item.pull_request?.merged_at || item.closed_at || item.created_at,
            labels: item.labels.flatMap((e) => (typeof e === "string" ? [] : [e])).map((l) => l.name),
            comments: item.comments,
          })),
      { concurrency: 3 },
    ) // concurrency 3 repos
    .confluenceByConcat() // merge page flows
    .map(async function process(item) {
      tlog(
        `PROCESSING ${item.url}#${item.title.replace(/\s+/g, "+")}_${item.body?.slice(0, 20).replaceAll(/\s+/g, "+")}`,
      );
      const url = item.url;
      const { owner, repo, issue_number } = parseIssueUrl(url);
      // create task
      let task = await saveGithubDesignTask(url, {
        type: item.type,
        state: item.state,
        stateAt: new Date(item.stateAt),
        title: item.title,
        user: item.user || "?",
        comments: item.comments || 0,
        bodyHash: item.body ? sha256(item.body) : undefined,
        lastRunAt: new Date(),
        taskStatus: "pending",
        lastDoneAt: null, // reset lastDoneAt
      });

      if (task.state === "open") {
        if (task.type === "pull_request" && meta.requestReviewers?.some((e) => !task.reviewers?.includes(e))) {
          const requestReviewers = meta.requestReviewers ?? DIE("Missing request reviewers");
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

        const text = (meta.slackMessageTemplate || DIE("Missing Slack message template"))
          .replace("{{COMMENTS}}", task.comments?.toString().replace(/^(.*)$/, "[r$1]") ?? "")
          .replace("{{STATE}}", task.state.toUpperCase())
          .replace("{{USERNAME}}", task.user ?? "=??=")
          .replace("{{GITHUBUSER}}", `<https://github.com/${task.user}|@${task.user}>`)
          .replace("{{ITEM_TYPE}}", task.type)
          .replace("{{TITLE}}", task.title)
          .replace("{{URL}}", task.url)
          .replace(/ +/, " ");
        const slackMsgHash = sha256(text);

        if (!task.slackUrl) {
          tlog(`Sending Slack Notification for design task: ${task.url} (${task.type})`);
          if (!dryRun) {
            const slack = getSlack();
            const msg = await slack.chat.postMessage({
              channel,
              text,
            });
            if (!msg.ok) {
              await saveGithubDesignTask(url, {
                error: `Failed to send Slack message: ${msg.error}`,
                taskStatus: "error",
              });
              throw new Error(`Failed to send Slack message: ${msg.error}`);
            }
            task = await saveGithubDesignTask(url, {
              slackUrl: slackMessageUrlStringify({ channel, ts: msg.ts! }),
              slackSentAt: new Date(),
              slackMsgHash,
            });
            tlog(`Slack message sent: ${task.slackUrl}`);
          }
        } else {
          // update slack message if outdated
          if (task.slackMsgHash !== slackMsgHash) {
            tlog(`Updating Slack message for task: ${task.url}`);
            if (!dryRun) {
              const slack = getSlack();
              await slack.chat.update({
                ...slackMessageUrlParse(task.slackUrl),
                text,
              });
              task = await saveGithubDesignTask(url, { slackMsgHash });
              tlog(`Slack message updated: ${task.slackUrl}`);
            }
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


