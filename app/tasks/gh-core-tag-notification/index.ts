#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { normalizeGithubUrl } from "@/src/normalizeGithubUrl";
import { getSlackChannel } from "@/lib/slack/channels";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow from "sflow";
import { upsertSlackMessage } from "../gh-desktop-release-notification/upsertSlackMessage";

/**
 * GitHub Core Tag Notification Task
 *
 * Workflow:
 * 1. Fetch ComfyUI core repo latest tags
 * 2. Save the tag info to the database
 * 3. Notify new tags to slack
 */

const config = {
  repo: "https://github.com/Comfy-Org/ComfyUI",
  slackChannels: ["desktop", "live-ops"],
  slackMessage: "🏷️ ComfyUI <{url}|Tag {tagName}> created!",
  sendSince: new Date("2025-11-19T00:00:00Z").toISOString(),
  tagsPerPage: 3,
};

export type GithubCoreTagNotificationTask = {
  tagName: string;
  commitSha: string;
  url: string;
  createdAt?: Date;
  taggerDate?: Date;
  message?: string;

  /** @deprecated use slackMessages future, keep slackMessage for backward compatiable here */
  slackMessage?: {
    text: string;
    /** @deprecated lets use channelName for future tasks, keep channel just for backward compatiable here */
    channel: string;
    url?: string;
  };

  slackMessages?: {
    text: string;
    /** @deprecated lets use channelName for future tasks, keep channel just for backward compatiable here */
    channel: string;
    url?: string;
  }[];
};

export const GithubCoreTagNotificationTask = db.collection<GithubCoreTagNotificationTask>(
  "GithubCoreTagNotificationTask",
);

await GithubCoreTagNotificationTask.createIndex({ tagName: 1 }, { unique: true });

const save = async (task: { tagName: string } & Partial<GithubCoreTagNotificationTask>) => {
  // Normalize URLs to handle both comfyanonymous and Comfy-Org formats
  const normalizedTask = {
    ...task,
    url: task.url ? normalizeGithubUrl(task.url) : undefined,
  };

  // Incremental migration: Check both tagName (unique key) and old URL format
  // Tag name is the unique identifier, but we normalize URLs for consistency
  const existing = await GithubCoreTagNotificationTask.findOne({
    tagName: normalizedTask.tagName,
  });

  return (await GithubCoreTagNotificationTask.findOneAndUpdate(
    existing ? { _id: existing._id } : { tagName: normalizedTask.tagName },
    { $set: normalizedTask },
    { upsert: true, returnDocument: "after" },
  )) || DIE("never");
};

if (import.meta.main) {
  await runGithubCoreTagNotificationTask();
  console.log("done");
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

async function runGithubCoreTagNotificationTask() {
  const { owner, repo } = parseGithubRepoUrl(config.repo);
  const pSlackChannelIds = Promise.all(
    config.slackChannels.map((channelName) =>
      getSlackChannel(channelName).then((e) => ({
        channelName,
        channelId: e.id || DIE(`unable to get slack channel ${channelName}`),
      })),
    ),
  );

  const tags = await gh.repos.listTags({
    owner,
    repo,
    per_page: config.tagsPerPage,
  });

  await sflow(tags.data)
    .map(async (tag) => {
      const existingTask = await GithubCoreTagNotificationTask.findOne({ tagName: tag.name });
      const slackChannelIds = await pSlackChannelIds;

      // Check if all channels have been notified
      const allChannelsNotified = slackChannelIds.every((ch) =>
        existingTask?.slackMessages?.some((msg) => msg.channel === ch.channelId && msg.url),
      );
      if (allChannelsNotified) {
        return existingTask;
      }

      const tagUrl = `https://github.com/${owner}/${repo}/releases/tag/${tag.name}`;

      let taggerDate;
      let message;

      try {
        const gitTag = await gh.git.getTag({
          owner,
          repo,
          tag_sha: tag.commit.sha,
        });

        if (gitTag.data.tagger) {
          taggerDate = new Date(gitTag.data.tagger.date);
          message = gitTag.data.message;
        }
      } catch {
        // Silently continue - tag might be lightweight (not annotated)
        // Lightweight tags don't have tagger info, which is expected
      }

      let task = await save({
        tagName: tag.name,
        commitSha: tag.commit.sha,
        url: tagUrl,
        createdAt: new Date(),
        taggerDate,
        message,
      });

      if (task.taggerDate && +task.taggerDate < +new Date(config.sendSince)) {
        return task;
      }

      if (!task.taggerDate) {
        const commitData = await gh.repos.getCommit({
          owner,
          repo,
          ref: tag.commit.sha,
        });
        const commitDate = new Date(
          commitData.data.commit.author?.date ||
            commitData.data.commit.committer?.date ||
            new Date(),
        );

        if (+commitDate < +new Date(config.sendSince)) {
          return task;
        }
      }

      const slackMessageText = config.slackMessage
        .replace("{url}", task.url)
        .replace("{tagName}", task.tagName)
        .replace(/$/, task.message ? `\n> ${task.message}` : "");

      // Send to all configured channels
      const slackMessages = await Promise.all(
        slackChannelIds.map(async ({ channelId, channelName }) => {
          const existingMessage =
            task.slackMessages?.find((msg) => msg.channel === channelId) ||
            (task.slackMessage?.channel === channelId
              ? {
                  text: task.slackMessage.text,
                  channel: task.slackMessage.channel,
                  url: task.slackMessage.url,
                }
              : undefined);

          if (!existingMessage || existingMessage.text !== slackMessageText) {
            console.log(
              `Tag ${task.tagName} notified to Slack channel ${channelName} (${channelId})`,
            );
            const msg = await upsertSlackMessage({
              channel: channelId,
              text: slackMessageText,
              url: existingMessage?.url,
            });
            return msg;
          }

          return existingMessage;
        }),
      );

      task = await save({
        tagName: task.tagName,
        slackMessages,
      });

      return task;
    })
    .log()
    .run();
}

export default runGithubCoreTagNotificationTask;
