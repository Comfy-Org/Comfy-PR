#!/usr/bin/env bun --hot
import { getSlack, isSlackAvailable } from "@/lib/slack";
import { getSlackChannel } from "@/lib/slack/channels";
import KeyvSqlite from "@keyv/sqlite";
import DIE from "@snomiao/die";
import chalk from "chalk";
import Keyv from "keyv";
import { slackMessageUrlParse, slackMessageUrlStringify } from "../gh-design/slackMessageUrlParse";
import { COMFY_PR_CACHE_DIR } from "./COMFY_PR_CACHE_DIR";
import * as prettier from "prettier";
import { slack } from "@/lib";

const SlackChannelIdsCache = new Keyv<string>(
  new KeyvSqlite("sqlite://" + COMFY_PR_CACHE_DIR + "/slackChannelIdCache.sqlite"),
);
const _SlackUserIdsCache = new Keyv<string>(
  new KeyvSqlite("sqlite://" + COMFY_PR_CACHE_DIR + "/slackUserIdCache.sqlite"),
);

/**
 * Slack message length limits
 * - Text in messages: 40,000 characters
 * - Text in markdown blocks: 12,000 characters cumulative
 * - We use conservative limits to be safe
 */
const _SLACK_TEXT_LIMIT = 35000; // Conservative limit for text parameter
const _SLACK_MARKDOWN_BLOCK_LIMIT = 11000; // Conservative limit for markdown blocks

/**
 * Truncate text from the middle, preserving start and end
 */
function _truncateFromMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncationMarker = "\n\n...TRUNCATED...\n\n";
  const markerLength = truncationMarker.length;
  const halfLength = Math.floor((maxLength - markerLength) / 2);

  return text.slice(0, halfLength) + truncationMarker + text.slice(-halfLength);
}

/**
 * Create or update existing slack message
 *
 * Note: the returned value 'channel' is a channel id, not name
 *
 * To tag a user, use <@UserId>, e.g. <@snomiao>
 */
export async function upsertSlackMessage({
  text,
  channel,
  channelName,
  url,
  replyUrl,
  reply_broadcast,
}: {
  text: string;
  /** channelId */
  channel?: string;
  channelName?: string;
  url?: string;
  replyUrl?: string;
  reply_broadcast?: boolean;
}) {
  const slack = getSlack();

  if (channelName) {
    channel ||=
      (await SlackChannelIdsCache.get(channelName)) ||
      (await (async () => {
        const ch = await getSlackChannel(channelName);
        const id =
          ch.id ||
          DIE(`Got slack channel from ${channelName} but no id ` + JSON.stringify(channel));
        await SlackChannelIdsCache.set(channelName, id);
        return id;
      })());
  }
  if (!channel) DIE(`No slack channel specified`);

  if (!url) {
    if (process.env.DRY_RUN) {
      console.error("DRY RUN MODE");
      console.error("sending text:", text);
      throw new Error(chalk.red("Sending slack message to: " + JSON.stringify({ channel })));
    }
    const thread_ts = !replyUrl ? undefined : slackMessageUrlParse(replyUrl).ts;
    const msg = !thread_ts
      ? await slack.chat.postMessage({ text, channel })
      : await slack.chat.postMessage({
          text,
          channel,
          thread_ts,
          reply_broadcast: reply_broadcast ?? false,
        });

    const url = slackMessageUrlStringify({ channel, ts: msg.ts! });
    return { ...msg, url, text, channel };
  }
  if (process.env.DRY_RUN) {
    console.error("DRY RUN MODE");
    console.error("sending text:", text);
    throw new Error(chalk.red("Updating slack message to: " + JSON.stringify({ channel, url })));
  }
  const ts = slackMessageUrlParse(url).ts;
  const msg = await slack.chat.update({ text, channel, ts });
  return { ...msg, url, text, channel };
}

/**
 * Create or update existing slack message
 *
 * Note: the returned value 'channel' is a channel id, not name
 *
 * Note: will always update if url is provided, even if the content is the same, so deduplication should be handled by caller if needed
 */
export async function upsertSlackMarkdownMessage({
  markdown,
  channel,
  channelName,
  url,
  replyUrl,
  reply_broadcast,
}: {
  markdown: string;
  /** channelId */
  channel?: string;
  channelName?: string;
  url?: string;
  replyUrl?: string;
  reply_broadcast?: boolean;
}) {
  // format the md before send
  markdown = await mdFmt(markdown);

  if (channelName) {
    channel ||=
      (await SlackChannelIdsCache.get(channelName)) ||
      (await (async () => {
        const ch = await getSlackChannel(channelName);
        const id =
          ch.id ||
          DIE(`Got slack channel from ${channelName} but no id ` + JSON.stringify(channel));
        await SlackChannelIdsCache.set(channelName, id);
        return id;
      })());
  }
  if (!channel) DIE(`No slack channel specified`);

  if (!url) {
    if (process.env.DRY_RUN) {
      console.error("DRY RUN MODE");
      console.error("sending markdown:", markdown);
      throw new Error(chalk.red("Sending slack message to: " + JSON.stringify({ channel })));
    }
    const thread_ts = !replyUrl ? undefined : slackMessageUrlParse(replyUrl).ts;
    const msg = !thread_ts
      ? await slack.chat.postMessage({
          text: markdown,
          channel,
          blocks: [{ type: "markdown", text: markdown }],
        })
      : await slack.chat.postMessage({
          text: markdown,
          blocks: [{ type: "markdown", text: markdown }],
          channel,
          thread_ts,
          reply_broadcast: reply_broadcast ?? false,
        });

    const url = slackMessageUrlStringify({ channel, ts: msg.ts! });
    return { ...msg, url, text: markdown, channel };
  }
  if (process.env.DRY_RUN) {
    console.error("DRY RUN MODE");
    console.error("sending markdown:", markdown);
    throw new Error(chalk.red("Updating slack message to: " + JSON.stringify({ channel, url })));
  }
  const ts = slackMessageUrlParse(url).ts;
  const msg = await slack.chat.update({
    text: markdown,
    channel,
    ts,
    blocks: [{ type: "markdown", text: markdown }],
  });
  return { ...msg, url, text: markdown, channel };
}

if (import.meta.main) {
  if (!isSlackAvailable()) {
    console.log("Slack token not configured, skipping upsertSlackMessage test");
  } else {
    // const myMsg = slackMessageUrlParse('https://comfy-organization.slack.com/archives/C095SJWUYMR/p1755243753632819')

    // post new message
    const msg = await upsertSlackMessage({
      channelName: "sno-test-channel",
      text: "Hello @sno @snomiao <@sno> <@snomiao>, this is a test message from upsertSlackMessage function.",
    });
    // console.log(msg)
    console.log(msg.url);

    // // edit that by providing msg url
    const msgEdited = await upsertSlackMessage({
      ...msg,
      text: msg.text + "\nThis is a msg edit",
    });
    console.log(msgEdited);

    // // reply that msg by providing reply url
    // const msgReplied = await upsertSlackMessage({
    //   channel: msgEdited.channel,
    //   text: "Hello @snomiao, this is a reply to last message.",
    //   replyUrl: msgEdited.url,
    //   reply_broadcast: true,
    // });
    // console.log(msgReplied)
  }
}
export async function mdFmt(md: string) {
  return await prettier.format(md, { parser: "markdown" });
}
