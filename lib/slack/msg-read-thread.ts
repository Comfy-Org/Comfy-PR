#!/usr/bin/env bun
import { slack } from "@/lib";
import DIE from "@snomiao/die";
import sflow from "sflow";
import { parseArgs } from "util";
import { parseSlackMessageToMarkdown } from "./parseSlackMessageToMarkdown";
import { slackTsToISO } from "./slackTsToISO";
import yaml from "yaml";
/**
 * Read messages from a Slack thread
 * Usage: bun bot/slack/msg-read-thread.ts --channel C123 --ts 1234567890.123456
 */

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      channel: {
        type: "string",
        short: "c",
      },
      ts: {
        type: "string",
        short: "t",
      },
      limit: {
        type: "string",
        short: "l",
        default: "100",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values.channel || !values.ts) {
    console.error(
      "Usage: bun bot/slack/msg-read-thread.ts --channel <channel_id> --ts <thread_ts> [--limit <number>]",
    );
    console.error(
      "Example: bun bot/slack/msg-read-thread.ts --channel C123ABC --ts 1234567890.123456 --limit 50",
    );
    process.exit(1);
  }

  const messages = await readSlackThread(
    values.channel,
    values.ts,
    parseInt(values.limit || "100"),
  );

  console.log(yaml.stringify(messages));
}

export async function readSlackThread(channel: string, ts: string, limit: number = 100) {
  try {
    const result = await slack.conversations.replies({
      channel,
      ts,
      limit,
    });

    if (!result.ok) {
      throw new Error(`Failed to read thread: ${result.error}`);
    }

    const messages = await sflow(result.messages || [])
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
    console.error("Error reading Slack thread:", error);
    throw error;
  }
}
