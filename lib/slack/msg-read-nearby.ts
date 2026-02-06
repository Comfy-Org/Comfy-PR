#!/usr/bin/env bun
import { slack } from "@/lib";
import DIE from "@snomiao/die";
import sflow from "sflow";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackMessageToMarkdown } from "./parseSlackMessageToMarkdown";
import { parseSlackUrl } from "./parseSlackUrl";
import { slackTsToISO } from "./slackTsToISO";

/**
 * Read nearby messages around a specific timestamp in a Slack channel
 * Usage: bun bot/slack/msg-read-nearby.ts --channel C123 --ts 1234567890.123456 --before 10 --after 10
 */

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      url: {
        type: "string",
        short: "u",
      },
      channel: {
        type: "string",
        short: "c",
      },
      ts: {
        type: "string",
        short: "t",
      },
      before: {
        type: "string",
        short: "b",
        default: "10",
      },
      after: {
        type: "string",
        short: "a",
        default: "10",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  let channel: string;
  let ts: string;

  // Parse from URL if provided
  if (values.url) {
    const parsed = parseSlackUrl(values.url);
    if (!parsed) {
      console.error("Failed to parse Slack URL. Please check the format.");
      process.exit(1);
    }
    channel = parsed.channel;
    ts = parsed.ts;
  } else {
    if (!values.channel || !values.ts) {
      console.error(
        "Usage: bun bot/slack/msg-read-nearby.ts --channel <channel_id> --ts <timestamp> [--before <number>] [--after <number>]",
      );
      console.error(
        "   or: bun bot/slack/msg-read-nearby.ts --url <slack_url> [--before <number>] [--after <number>]",
      );
      console.error(
        "Example: bun bot/slack/msg-read-nearby.ts --channel C123ABC --ts 1234567890.123456 --before 5 --after 5",
      );
      console.error(
        "Example: bun bot/slack/msg-read-nearby.ts --url 'https://workspace.slack.com/archives/C123/p1234567890' --before 10 --after 10",
      );
      process.exit(1);
    }
    channel = values.channel;
    ts = values.ts;
  }

  const before = parseInt(values.before || "10");
  const after = parseInt(values.after || "10");

  const messages = await readNearbyMessages(channel, ts, before, after);

  console.log(yaml.stringify(messages));
}

export async function readNearbyMessages(
  channel: string,
  ts: string,
  before: number = 10,
  after: number = 10,
) {
  try {
    // Read messages before the target timestamp
    const beforeResult = await slack.conversations.history({
      channel,
      latest: ts,
      limit: before + 1, // +1 to include the target message
      inclusive: true,
    });

    // Read messages after the target timestamp
    const afterResult = await slack.conversations.history({
      channel,
      oldest: ts,
      limit: after + 1, // +1 to include the target message
      inclusive: true,
    });

    // Combine and deduplicate messages
    const allMessages = new Map();

    for (const msg of [...(beforeResult.messages || []), ...(afterResult.messages || [])]) {
      if (msg.ts) {
        allMessages.set(msg.ts, msg);
      }
    }

    // Sort by timestamp
    const sortedMessages = Array.from(allMessages.values()).sort((a, b) => {
      const tsA = parseFloat(a.ts || "0");
      const tsB = parseFloat(b.ts || "0");
      return tsA - tsB;
    });

    // Format messages
    const messages = await sflow(sortedMessages)
      .map(async (m) => {
        const user = m.user
          ? await slack.users
              .info({ user: m.user })
              .then((res) => res.user?.name || `<@${m.user}>`)
              .catch(() => `<@${m.user}>`)
          : "Unknown";

        return {
          ts: m.ts || DIE("missing ts"),
          iso: slackTsToISO(m.ts || DIE("missing ts")),
          username: user,
          text: m.text || "",
          markdown: await parseSlackMessageToMarkdown(m.text || ""),
          is_target: m.ts === ts,
          ...(m.thread_ts && { thread_ts: m.thread_ts }),
          ...(m.files &&
            m.files.length > 0 && {
              files: m.files.map((f: unknown) => ({
                name: f.name,
                title: f.title,
                mimetype: f.mimetype,
                size: f.size,
                url_private: f.url_private,
                permalink: f.permalink,
              })),
            }),
          ...(m.attachments &&
            m.attachments.length > 0 && {
              attachments: m.attachments.map((a: unknown) => ({
                title: a.title,
                title_link: a.title_link,
                text: a.text,
                fallback: a.fallback,
                image_url: a.image_url,
                from_url: a.from_url,
              })),
            }),
          ...(m.reactions &&
            m.reactions.length > 0 && {
              reactions: m.reactions.map((r: unknown) => ({
                name: r.name,
                count: r.count,
              })),
            }),
        };
      })
      .toArray();

    return messages;
  } catch (error) {
    console.error("Error reading nearby Slack messages:", error);
    throw error;
  }
}
