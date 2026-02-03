#!/usr/bin/env bun
import { slack } from "@/lib";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackUrl } from "./parseSlackUrl";

/**
 * Get permalink for a message
 */
export async function getMessagePermalink(channel: string, messageTs: string) {
  try {
    const result = await slack.chat.getPermalink({
      channel,
      message_ts: messageTs,
    });

    if (!result.ok) {
      throw new Error(`Failed to get permalink: ${result.error || "unknown error"}`);
    }

    return {
      channel,
      message_ts: messageTs,
      permalink: result.permalink,
    };
  } catch (error) {
    console.error("Error getting message permalink:", error);
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
      ts: {
        type: "string",
        short: "t",
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
      console.error("Usage: bun lib/slack/permalink.ts --channel <channel_id> --ts <timestamp>");
      console.error("   or: bun lib/slack/permalink.ts --url <slack_url>");
      console.error("\nExamples:");
      console.error("  bun lib/slack/permalink.ts --channel C123ABC --ts 1234567890.123456");
      console.error(
        "  bun lib/slack/permalink.ts --url 'https://workspace.slack.com/archives/C123/p1234567890'",
      );
      process.exit(1);
    }
    channel = values.channel;
    ts = values.ts;
  }

  const permalink = await getMessagePermalink(channel, ts);
  console.log(yaml.stringify(permalink));
}
