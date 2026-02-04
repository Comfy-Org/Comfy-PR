#!/usr/bin/env bun
import { slack } from "@/lib";
import DIE from "@snomiao/die";
import sflow from "sflow";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackMessageToMarkdown } from "./parseSlackMessageToMarkdown";
import { parseSlackUrlSmart } from "./parseSlackUrlSmart";
import { slackTsToISO } from "./slackTsToISO";

/**
 * List pinned messages in a channel
 */
export async function listPinnedMessages(channel: string) {
  try {
    const result = await slack.pins.list({
      channel,
    });

    if (!result.ok) {
      throw new Error(`Failed to list pins: ${result.error || "unknown error"}`);
    }

    const items = result.items || [];

    // Get channel info
    const channelInfo = await slack.conversations.info({
      channel,
    });
    const channelName = channelInfo.channel?.name || channel;

    // Format pinned items
    const formattedPins = await sflow(items)
      .map(async (item: any) => {
        // Pins can be messages or files
        if (item.message) {
          const msg = item.message;
          const user = msg.user
            ? await slack.users
                .info({ user: msg.user })
                .then((res) => res.user?.name || msg.user)
                .catch(() => msg.user)
            : "unknown";

          return {
            type: "message",
            ts: msg.ts || DIE("missing ts"),
            iso: slackTsToISO(msg.ts || DIE("missing ts")),
            user: msg.user || "unknown",
            username: user,
            text: msg.text || "",
            markdown: await parseSlackMessageToMarkdown(msg.text || ""),
            pinned_at: item.created ? slackTsToISO(item.created.toString()) : undefined,
            pinned_by: item.created_by,
            ...(msg.reactions &&
              msg.reactions.length > 0 && {
                reactions: msg.reactions.map((r: any) => ({
                  name: r.name,
                  count: r.count,
                })),
              }),
          };
        } else if (item.file) {
          const file = item.file;
          return {
            type: "file",
            file_id: file.id,
            file_name: file.name,
            file_title: file.title,
            mimetype: file.mimetype,
            size: file.size,
            url_private: file.url_private,
            permalink: file.permalink,
            pinned_at: item.created ? slackTsToISO(item.created.toString()) : undefined,
            pinned_by: item.created_by,
          };
        } else {
          return {
            type: "unknown",
            raw: item,
          };
        }
      })
      .toArray();

    return {
      channel,
      channel_name: channelName,
      total_pins: formattedPins.length,
      pins: formattedPins,
    };
  } catch (error) {
    console.error("Error listing pinned messages:", error);
    throw error;
  }
}

// CLI usage
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
    },
    strict: true,
    allowPositionals: false,
  });

  let channel: string;

  // Parse from URL if provided
  if (values.url) {
    const parsed = parseSlackUrlSmart(values.url);
    if (parsed.type !== "channel" && !parsed.channel) {
      console.error("URL must be a channel URL or message URL");
      process.exit(1);
    }
    channel = parsed.channel!;
  } else {
    if (!values.channel) {
      console.error("Usage: bun lib/slack/pins.ts --channel <channel_id>");
      console.error("   or: bun lib/slack/pins.ts --url <slack_channel_url>");
      console.error("\nExamples:");
      console.error("  bun lib/slack/pins.ts --channel C123ABC");
      console.error(
        "  bun lib/slack/pins.ts --url 'https://workspace.slack.com/archives/C123'",
      );
      process.exit(1);
    }
    channel = values.channel;
  }

  const pins = await listPinnedMessages(channel);
  console.log(yaml.stringify(pins));
}
