#!/usr/bin/env bun
import { slack } from "@/lib";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackUrlSmart } from "./parseSlackUrlSmart";
import { slackTsToISO } from "./slackTsToISO";

/**
 * Get comprehensive channel information
 */
export async function getChannelInfo(channelId: string) {
  try {
    const result = await slack.conversations.info({
      channel: channelId,
      include_num_members: true,
    });

    if (!result.ok) {
      throw new Error(`Failed to get channel info: ${result.error || "unknown error"}`);
    }

    const channel = result.channel as any;

    return {
      id: channel.id,
      name: channel.name,
      is_channel: channel.is_channel,
      is_group: channel.is_group,
      is_im: channel.is_im,
      is_private: channel.is_private,
      is_archived: channel.is_archived,
      is_shared: channel.is_shared,
      is_org_shared: channel.is_org_shared,
      is_general: channel.is_general,
      created: channel.created ? slackTsToISO(channel.created.toString()) : undefined,
      creator: channel.creator,
      num_members: channel.num_members,
      topic: {
        value: channel.topic?.value || "",
        creator: channel.topic?.creator,
        last_set: channel.topic?.last_set ? slackTsToISO(channel.topic.last_set.toString()) : undefined,
      },
      purpose: {
        value: channel.purpose?.value || "",
        creator: channel.purpose?.creator,
        last_set: channel.purpose?.last_set
          ? slackTsToISO(channel.purpose.last_set.toString())
          : undefined,
      },
      ...(channel.latest && {
        latest_message: {
          ts: channel.latest.ts,
          iso: slackTsToISO(channel.latest.ts),
          text: channel.latest.text,
          user: channel.latest.user,
        },
      }),
    };
  } catch (error) {
    console.error("Error getting channel info:", error);
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
      console.error("Usage: bun lib/slack/channel-info.ts --channel <channel_id>");
      console.error("   or: bun lib/slack/channel-info.ts --url <slack_channel_url>");
      console.error("\nExamples:");
      console.error("  bun lib/slack/channel-info.ts --channel C123ABC");
      console.error(
        "  bun lib/slack/channel-info.ts --url 'https://workspace.slack.com/archives/C123'",
      );
      process.exit(1);
    }
    channel = values.channel;
  }

  const info = await getChannelInfo(channel);
  console.log(yaml.stringify(info));
}
