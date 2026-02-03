#!/usr/bin/env bun
import { slack } from "@/lib";
import DIE from "@snomiao/die";
import sflow from "sflow";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackMessageToMarkdown } from "./parseSlackMessageToMarkdown";
import { slackTsToISO } from "./slackTsToISO";

/**
 * Read recent messages from a Slack channel
 * Usage: bun lib/slack/msg-read-recent.ts --channel C123 --limit 10
 */

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      channel: {
        type: "string",
        short: "c",
      },
      limit: {
        type: "string",
        short: "l",
        default: "10",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values.channel) {
    console.error(
      "Usage: bun lib/slack/msg-read-recent.ts --channel <channel_id> [--limit <number>]",
    );
    console.error("Example: bun lib/slack/msg-read-recent.ts --channel C123ABC --limit 10");
    process.exit(1);
  }

  const channel = values.channel;
  const limit = parseInt(values.limit || "10");

  const messages = await readRecentMessages(channel, limit);

  console.log(yaml.stringify(messages));
}

export async function readRecentMessages(channel: string, limit: number = 10) {
  try {
    // Read recent messages from the channel
    const result = await slack.conversations.history({
      channel,
      limit,
    });

    if (!result.ok) {
      throw new Error(`Failed to read messages: ${result.error || "unknown error"}`);
    }

    const messages = result.messages || [];

    // Sort by timestamp (most recent first)
    const sortedMessages = messages.sort((a, b) => {
      const tsA = parseFloat(a.ts || "0");
      const tsB = parseFloat(b.ts || "0");
      return tsB - tsA; // Descending order (newest first)
    });

    // Format messages
    const formattedMessages = await sflow(sortedMessages)
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
          ...(m.thread_ts && { thread_ts: m.thread_ts }),
          ...(m.files &&
            m.files.length > 0 && {
              files: m.files.map((f: any) => ({
                id: f.id,
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
              attachments: m.attachments.map((a: any) => ({
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
              reactions: m.reactions.map((r: any) => ({
                name: r.name,
                count: r.count,
              })),
            }),
        };
      })
      .toArray();

    return formattedMessages;
  } catch (error) {
    console.error("Error reading recent Slack messages:", error);
    throw error;
  }
}
