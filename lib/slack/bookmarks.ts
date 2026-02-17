#!/usr/bin/env bun
import { slack } from "@/lib";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackUrlSmart } from "./parseSlackUrlSmart";
import { slackTsToISO } from "./slackTsToISO";

/**
 * List bookmarks in a channel
 */
export async function listChannelBookmarks(channelId: string) {
  try {
    const result = await slack.bookmarks.list({
      channel_id: channelId,
    });

    if (!result.ok) {
      throw new Error(`Failed to list bookmarks: ${result.error || "unknown error"}`);
    }

    const bookmarks = result.bookmarks || [];

    // Get channel info
    const channelInfo = await slack.conversations.info({
      channel: channelId,
    });
    const channelName = channelInfo.channel?.name || channelId;

    // Format bookmarks
    const formattedBookmarks = bookmarks.map((bookmark) => ({
      id: bookmark.id,
      title: bookmark.title,
      link: bookmark.link,
      emoji: bookmark.emoji,
      type: bookmark.type,
      created: bookmark.date_created ? slackTsToISO(bookmark.date_created.toString()) : undefined,
      updated: bookmark.date_updated ? slackTsToISO(bookmark.date_updated.toString()) : undefined,
      created_by: bookmark.app_id || bookmark.entity_id,
      ...(bookmark.icon_url ? { icon_url: bookmark.icon_url } : {}),
    }));

    return {
      channel: channelId,
      channel_name: channelName,
      total_bookmarks: formattedBookmarks.length,
      bookmarks: formattedBookmarks,
    };
  } catch (error) {
    console.error("Error listing channel bookmarks:", error);
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
      console.error("Usage: bun lib/slack/bookmarks.ts --channel <channel_id>");
      console.error("   or: bun lib/slack/bookmarks.ts --url <slack_channel_url>");
      console.error("\nExamples:");
      console.error("  bun lib/slack/bookmarks.ts --channel C123ABC");
      console.error(
        "  bun lib/slack/bookmarks.ts --url 'https://workspace.slack.com/archives/C123'",
      );
      process.exit(1);
    }
    channel = values.channel;
  }

  const bookmarks = await listChannelBookmarks(channel);
  console.log(yaml.stringify(bookmarks));
}
