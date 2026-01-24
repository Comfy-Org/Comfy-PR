#!/usr/bin/env bun
import { slack } from "@/lib";
import { parseArgs } from "util";
import yaml from "yaml";
import { getChannelInfo } from "./channel-info";
import { parseSlackUrl } from "./parseSlackUrl";
import { getMessageReactions } from "./reactions";
import { slackTsToISO } from "./slackTsToISO";

/**
 * Get complete context for a message by combining multiple APIs
 */
export async function getCompleteMessageContext(channel: string, ts: string) {
  try {
    // 1. Get the message itself
    const messagesResult = await slack.conversations.history({
      channel,
      latest: ts,
      inclusive: true,
      limit: 1,
    });
    const message = messagesResult.messages?.[0] as any;

    if (!message) {
      throw new Error("Message not found");
    }

    // 2. Get reactions (if any)
    let reactions = null;
    try {
      const reactionsData = await getMessageReactions(channel, ts);
      reactions = reactionsData.reactions;
    } catch {
      // No reactions or error - that's ok
      reactions = [];
    }

    // 3. Get thread replies if it's a thread
    let threadInfo = null;
    if (message.thread_ts) {
      try {
        const threadResult = await slack.conversations.replies({
          channel,
          ts: message.thread_ts,
          limit: 100,
        });
        threadInfo = {
          reply_count: threadResult.messages?.length || 0,
          is_thread_parent: message.ts === message.thread_ts,
        };
      } catch {
        // Thread error - that's ok
      }
    }

    // 4. Get channel info
    const channelInfo = await getChannelInfo(channel);

    // 5. Get user info
    let userInfo = null;
    if (message.user) {
      try {
        const userResult = await slack.users.info({ user: message.user });
        const user = userResult.user as any;
        userInfo = {
          id: user.id,
          name: user.name,
          real_name: user.real_name,
          display_name: user.profile?.display_name || user.name,
          title: user.profile?.title || "",
          is_bot: user.is_bot,
        };
      } catch {
        // User info error - that's ok
      }
    }

    // 6. Get permalink
    let permalink = null;
    try {
      const permalinkResult = await slack.chat.getPermalink({
        channel,
        message_ts: ts,
      });
      permalink = permalinkResult.permalink;
    } catch {
      // Permalink error - that's ok
    }

    // 7. Check if pinned
    let isPinned = false;
    try {
      const pinsResult = await slack.pins.list({ channel });
      isPinned = pinsResult.items?.some((item: any) => item.message?.ts === ts) || false;
    } catch {
      // Pins error - that's ok
    }

    return {
      message: {
        ts: message.ts,
        iso: slackTsToISO(message.ts),
        text: message.text || "",
        type: message.type,
        subtype: message.subtype,
      },
      reactions: {
        total: reactions?.length || 0,
        details: reactions || [],
      },
      thread: threadInfo,
      channel: {
        id: channelInfo.id,
        name: channelInfo.name,
        is_private: channelInfo.is_private,
        is_archived: channelInfo.is_archived,
        num_members: channelInfo.num_members,
        topic: channelInfo.topic.value,
        purpose: channelInfo.purpose.value,
      },
      user: userInfo,
      permalink,
      is_pinned: isPinned,
      context_retrieved_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error getting complete message context:", error);
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
      console.error("Usage: bun lib/slack/context.ts --channel <channel_id> --ts <timestamp>");
      console.error("   or: bun lib/slack/context.ts --url <slack_url>");
      console.error("\nExamples:");
      console.error("  bun lib/slack/context.ts --channel C123ABC --ts 1234567890.123456");
      console.error(
        "  bun lib/slack/context.ts --url 'https://workspace.slack.com/archives/C123/p1234567890'",
      );
      process.exit(1);
    }
    channel = values.channel;
    ts = values.ts;
  }

  const context = await getCompleteMessageContext(channel, ts);
  console.log(yaml.stringify(context));
}
