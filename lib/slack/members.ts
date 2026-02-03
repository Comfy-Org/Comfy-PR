#!/usr/bin/env bun
import { slack } from "@/lib";
import sflow from "sflow";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackUrlSmart } from "./parseSlackUrlSmart";

/**
 * List members in a channel with their info
 */
export async function listChannelMembers(channelId: string, limit: number = 100) {
  try {
    const result = await slack.conversations.members({
      channel: channelId,
      limit,
    });

    if (!result.ok) {
      throw new Error(`Failed to list members: ${result.error || "unknown error"}`);
    }

    const memberIds = result.members || [];

    // Get channel info
    const channelInfo = await slack.conversations.info({
      channel: channelId,
    });
    const channelName = channelInfo.channel?.name || channelId;

    // Get user info for each member
    const members = await sflow(memberIds)
      .map(async (userId: string) => {
        try {
          const userInfo = await slack.users.info({ user: userId });
          const user = userInfo.user as any;

          return {
            id: user.id,
            name: user.name,
            real_name: user.real_name,
            display_name: user.profile?.display_name || user.name,
            title: user.profile?.title || "",
            email: user.profile?.email,
            is_admin: user.is_admin,
            is_owner: user.is_owner,
            is_bot: user.is_bot,
            is_app_user: user.is_app_user,
            deleted: user.deleted,
            ...(user.profile?.image_72 && { avatar: user.profile.image_72 }),
          };
        } catch {
          return {
            id: userId,
            name: userId,
            real_name: userId,
            display_name: userId,
            error: "Failed to fetch user info",
          };
        }
      })
      .toArray();

    return {
      channel: channelId,
      channel_name: channelName,
      total_members: members.length,
      members,
    };
  } catch (error) {
    console.error("Error listing channel members:", error);
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
      limit: {
        type: "string",
        short: "l",
        default: "100",
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
      console.error("Usage: bun lib/slack/members.ts --channel <channel_id> [--limit <number>]");
      console.error("   or: bun lib/slack/members.ts --url <slack_channel_url>");
      console.error("\nExamples:");
      console.error("  bun lib/slack/members.ts --channel C123ABC");
      console.error("  bun lib/slack/members.ts --channel C123ABC --limit 50");
      console.error(
        "  bun lib/slack/members.ts --url 'https://workspace.slack.com/archives/C123'",
      );
      process.exit(1);
    }
    channel = values.channel;
  }

  const limit = parseInt(values.limit || "100");
  const members = await listChannelMembers(channel, limit);
  console.log(yaml.stringify(members));
}
