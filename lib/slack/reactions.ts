#!/usr/bin/env bun
import { slack } from "@/lib";
import DIE from "@snomiao/die";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackUrl } from "./parseSlackUrl";

/**
 * Get reactions for a specific message
 */
export async function getMessageReactions(channel: string, ts: string) {
  try {
    const result = await slack.reactions.get({
      channel,
      timestamp: ts,
      full: true,
    });

    if (!result.ok) {
      throw new Error(`Failed to get reactions: ${result.error || "unknown error"}`);
    }

    const message = result.message as any;
    const reactions = message?.reactions || [];

    // Enrich reactions with user info
    const enrichedReactions = await Promise.all(
      reactions.map(async (reaction: any) => {
        const usernames = await Promise.all(
          reaction.users.map(async (userId: string) => {
            try {
              const userInfo = await slack.users.info({ user: userId });
              return {
                user_id: userId,
                username: userInfo.user?.name || userId,
                real_name: userInfo.user?.real_name || userId,
              };
            } catch {
              return {
                user_id: userId,
                username: userId,
                real_name: userId,
              };
            }
          }),
        );

        return {
          name: reaction.name,
          count: reaction.count,
          users: usernames,
        };
      }),
    );

    return {
      message_ts: ts,
      channel,
      total_reactions: enrichedReactions.reduce((sum, r) => sum + r.count, 0),
      reaction_types: enrichedReactions.length,
      reactions: enrichedReactions,
      message_text: message?.text || "",
    };
  } catch (error) {
    console.error("Error getting message reactions:", error);
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
      console.error("Usage: bun lib/slack/reactions.ts --channel <channel_id> --ts <timestamp>");
      console.error("   or: bun lib/slack/reactions.ts --url <slack_url>");
      console.error(
        "Example: bun lib/slack/reactions.ts --url 'https://workspace.slack.com/archives/C123/p1234567890'",
      );
      process.exit(1);
    }
    channel = values.channel;
    ts = values.ts;
  }

  const reactions = await getMessageReactions(channel, ts);
  console.log(yaml.stringify(reactions));
}
