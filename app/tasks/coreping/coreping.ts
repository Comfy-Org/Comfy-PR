// important-review-tracker

import { tsmatch } from "@/packages/mongodb-pipeline-ts/Task";
import { db } from "@/src/db";
import { TaskMetaCollection } from "@/src/db/TaskMeta";
import type { GH } from "@/src/gh";
import { ghc } from "@/src/ghc";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import chalk from "chalk";
import isCI from "is-ci";
import sflow, { pageFlow } from "sflow";
import { P } from "ts-pattern";
import z from "zod";
import { upsertSlackMessage } from "../gh-desktop-release-notification/upsertSlackMessage";

// yeah, if the bot could ping when updates have been made to a previously-reviewed PR, would be extremely helpful

/**
 * [Comfy- CorePing] The Core/Important PR Review Reminder Service
 * This service reminders @comfyanonymous for unreviewed Core/Core-Important PRs every 24 hours in the morning 8am of california
 *
 * Environment: it's designed to be run in github actions by cron-job.
 *
 * Usage: run this script in github actions by cron job, it will scan all Core/Important PRs and send a slack message to @comfyanonymous
 *
 * How should it works:
 *
 * Scan all comfy-prs, with labels 'Core-*'
 *    match theLabel("Core-Important") or theLabel("Core")
 *      check if the pr is reviewed (after the label added):
 *        when it's not reviewed yet:
 *          < 24h since the labeled event to now: fresh
 *          > 24h since the labeled event to now: stale
 *            Collect and send @comfy reminder
 *        when it's reviewed by @comfy after label:
 *          after pr-review/pr-comment, add comment can set "Core-Ready-For-Review", by '+label:Core-Ready-For-Review'
 *    match theLabel('Core-Ready-For-Review'):
 *
 */

export const coreReviewTrackerConfig = {
  REPOLIST: [
    "https://github.com/comfyanonymous/ComfyUI",
    "https://github.com/Comfy-Org/Comfy-PR",
    "https://github.com/Comfy-Org/ComfyUI_frontend",
    "https://github.com/Comfy-Org/desktop",
  ],
  labels: ["Core", "CoreImportant"],
  minReminderInterval: "24h", // edit-existed-slack-message < this-interval < send-another-slack-message
  slackChannelName: "develop", // develop channel, without notification

  // github message
  messageUpdatePattern: "<!-- COMFY_PR_BOT_TRACKER -->",
  staleMessage: `<!-- COMFY_PR_BOT_TRACKER --> This PR has been waiting for a response for too long. A reminder is being sent to @comfyanonymous.`,
  reviewedMessage: `<!-- COMFY_PR_BOT_TRACKER --> This PR is reviewed! When it's ready for review again, please add a comment with **+label:Core-Ready-for-Review** to reminder @comfyanonymous to restart the review process.`,
};
const cfg = coreReviewTrackerConfig;

export const LABELS = ["Core", "Core-Important"];

type ComfyCorePRs = {
  url: string;
  title: string;
  /**
   * status matchers:
   * closed: closed, ignore
   * unrelated: Core-Important is not labeled anymore
   * reviewed: reviewed after the label , => -label:Core-Important, +label:Core-Reviewed, send cfg.reviewedMessage
   * fresh: not reviewed yet after the label, < 24h since Core-Important labeled
   * stale: not reviewed yet after the label, > 24h since Core-Important labeled, send cfg.staleMessage
   */
  status: "fresh" | "stale" | "reviewed" | "closed" | "unrelated";
  statusMsg: string; // send to slack
  created_at: Date;
  labels: string[];
  // review status
  last_labeled_at?: Date;
  last_reviewed_at?: Date;
  last_commented_at?: Date;
  task_updated_at: Date;
};
export const ComfyCorePRs = db.collection<ComfyCorePRs>("ComfyCorePRs");

/* only one */
// type ComfyCorePRsLastMessage = {
//   url: string;
//   text: string;
// };
// export const ComfyCorePRsLastMessage = db.collection<ComfyCorePRsLastMessage>("ComfyCorePRsLastMessage");
const Meta = TaskMetaCollection(
  "ComfyCorePRs",
  z.object({
    lastSlackMessage: z
      .object({
        url: z.string(),
        text: z.string(),
        sendAt: z.date(),
      })
      .optional(),
  }),
);

const saveTask = async (pr: Partial<ComfyCorePRs> & { url: string }) => {
  return (
    (await ComfyCorePRs.findOneAndUpdate(
      { url: pr.url },
      { $set: { ...pr, task_updated_at: new Date() } },
      { upsert: true, returnDocument: "after" },
    )) || DIE("fail to save task" + JSON.stringify(pr))
  );
};

if (import.meta.main) {
  // Designed to be mon to sat, TIME CHECKING
  // Pacific Daylight Time
  await runCorePingTask();
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}
async function runCorePingTask() {
  // drop everytime since outdated data is useless, we kept lastSlackmessage in Meta collection which is enough
  await ComfyCorePRs.drop();

  console.log("start", import.meta.file);
  let freshCount = 0;

  const processedTasks = await sflow(coreReviewTrackerConfig.REPOLIST)
    .map((repoUrl) =>
      pageFlow(1, async (page, per_page = 100) => {
        const { data } = await ghc.pulls.list({ ...parseGithubRepoUrl(repoUrl), page, per_page, state: "open" });
        return { data, next: data.length >= per_page ? page + 1 : null };
      }).flat(),
    )
    .confluenceByConcat()
    .map(async (pr) => {
      const html_url = pr.html_url;
      const corePrLabel = pr.labels.find((e) =>
        tsmatch(e)
          .with({ name: P.union("Core", "Core-Important") }, (l) => l)
          .otherwise(() => null),
      );
      let task = await saveTask({
        url: pr.html_url,
        title: pr.title,
        created_at: new Date(pr.created_at),
        labels: pr.labels.map((e) => e.name),
      });

      if (!corePrLabel) return saveTask({ url: html_url, status: "unrelated" });
      if (pr.state === "closed") return saveTask({ url: html_url, status: "closed" });
      if (pr.draft) return saveTask({ url: html_url, status: "unrelated", statusMsg: "Draft PR, skipping" });

      // check timeline events
      const timeline = await fetchFullTimeline(html_url);

      // Check recent events
      const lastLabelEvent =
        timeline
          .map((e) =>
            tsmatch(e)
              .with({ label: { name: corePrLabel.name } }, (e) => e)
              .otherwise(() => null),
          )
          .findLast(Boolean) || DIE(`No ${corePrLabel.name} label event found`);

      task = await saveTask({ url: pr.html_url, last_labeled_at: new Date(lastLabelEvent.created_at) });
      const lastReviewEvent =
        timeline
          .map((e) =>
            tsmatch(e)
              .with(
                {
                  event: "reviewed",
                  author_association: P.union("COLLABORATOR", "MEMBER", "OWNER"),
                  submitted_at: P.string,
                },
                (e) => e as GH["timeline-reviewed-event"],
              )
              .otherwise(() => null),
          )
          .filter((e) => e?.submitted_at) // ignore pending reviews
          .findLast(Boolean) || null;
      if (lastReviewEvent)
        task = await saveTask({ url: pr.html_url, last_reviewed_at: new Date(lastReviewEvent.submitted_at!) });

      const lastCommentEvent =
        timeline
          .map((e) =>
            tsmatch(e)
              .with(
                { event: "commented", author_association: P.union("COLLABORATOR", "MEMBER", "OWNER") },
                (e) => e as GH["timeline-comment-event"],
              )
              .otherwise(() => null),
          )
          .findLast(Boolean) || null;
      if (lastCommentEvent)
        task = await saveTask({ url: pr.html_url, last_reviewed_at: new Date(lastCommentEvent.created_at) });

      //
      lastReviewEvent && console.log({ lastLabelEvent, lastReviewEvent });
      const isReviewed = task?.last_reviewed_at && +task.last_reviewed_at > +task.last_labeled_at!;
      const isCommented = task?.last_commented_at && +task.last_commented_at > +task.last_labeled_at!;

      const createdAt = new Date(lastLabelEvent.created_at);
      const now = new Date();
      const diff = now.getTime() - createdAt.getTime();
      const isFresh = diff <= 24 * 60 * 60 * 1000;

      const status = isReviewed ? "reviewed" : isCommented ? "reviewed" : isFresh ? "fresh" : "stale";

      const hours = Math.floor(diff / (60 * 60 * 1000));
      const sanitizedTitle = pr.title.replace(/\W+/g, " ").trim();
      const statusMsg = `@${pr.user?.login}'s ${corePrLabel.name} PR <${pr.html_url}|${sanitizedTitle}> is waiting for your feedback for more than ${hours} hours.`;
      console.log(statusMsg);
      console.log(pr.html_url + " " + pr.labels.map((e) => e.name));

      return await saveTask({ url: html_url, status, statusMsg });
    })
    .toArray();

  // processedTasks
  const corePRs = await ComfyCorePRs.find({
    status: { $in: ["fresh", "stale"] },
  })
    .sort({ last_labeled_at: 1 })
    .toArray();

  console.log("ready to send slack message to notify @comfy");

  const notifyMessage = !corePRs.length
    ? `Congratulations! All Core/Important PRs are reviewed! 🎉🎉🎉 \nSent from CorePing.ts by <@snomiao> cc <@Yoland>`
    : `Hey <@comfy>, Here's x${corePRs.length} Core/Important PRs waiting your feedback!\n\n${corePRs.map((pr) => pr.statusMsg || `- <${pr.url}|${pr.title}> ${pr.labels}`).join("\n")}\nSent from CorePing.ts by <@snomiao> cc <@Yoland>`;

  console.log(chalk.bgBlue(notifyMessage));
  // TODO: update message with delete line when it's reviewed
  // send or update slack message
  let meta = await Meta.$upsert({});

  // can only post new message: tz: PST,  day: working day + sat, time: 10-12am
  const canPostNewMessage = (() => {
    const now = new Date();
    const pstTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const day = pstTime.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const hour = pstTime.getHours();

    // Working days (Mon-Fri) + Saturday, but not Sunday
    const isValidDay = day >= 1 && day <= 6;
    // 10am-12pm PST (10-11:59)
    const isValidTime = hour >= 10 && hour < 12;

    return isValidDay && isValidTime;
  })();

  const canUpdateExistingMessage =
    meta.lastSlackMessage &&
    meta.lastSlackMessage.sendAt &&
    new Date().getTime() - new Date(meta.lastSlackMessage.sendAt).getTime() <= 23.9 * 60 * 60 * 1000;

  // if <24 h since last sent (not edit), update that msg
  const msgUpdateUrl = canUpdateExistingMessage && !canPostNewMessage ? meta.lastSlackMessage?.url : undefined;

  // DIE("check " + JSON.stringify(msgUpdateUrl));
  const msg = await upsertSlackMessage({
    text: notifyMessage,
    channelName: cfg.slackChannelName,
    url: msgUpdateUrl,
  });

  console.log("message posted: " + msg.url);
  meta = await Meta.$upsert({ lastSlackMessage: { text: msg.text, url: msg.url, sendAt: new Date() } });

  console.log("done", import.meta.file);
}
/**
 * get full timeline
 * - [Issue event types - GitHub Docs]( https://docs.github.com/en/rest/using-the-rest-api/issue-event-types?apiVersion=2022-11-28 )
 */
async function fetchFullTimeline(html_url: string) {
  return await pageFlow(1, async (page, per_page = 100) => {
    const { data } = await ghc.issues.listEventsForTimeline({
      ...parseIssueUrl(html_url),
      page,
      per_page,
    });
    return { data, next: data.length >= per_page ? page + 1 : null };
  })
    .flat()
    .toArray();
}
