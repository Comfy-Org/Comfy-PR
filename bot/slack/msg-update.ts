#!/usr/bin/env bun
import { slack } from "@/lib";
import { parseArgs } from "util";

/**
 * Update a Slack message
 * Usage: bun bot/slack/msg-update.ts --channel C123 --ts 1234567890.123456 --text "Updated message"
 */
async function updateSlackMessage(channel: string, ts: string, text: string) {
  try {
    const result = await slack.chat.update({
      channel,
      ts,
      text,
    });

    if (result.ok) {
      console.log(`Message updated successfully: ${ts}`);
      return result;
    } else {
      throw new Error(`Failed to update message: ${result.error}`);
    }
  } catch (error) {
    console.error("Error updating Slack message:", error);
    throw error;
  }
}

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
      text: {
        type: "string",
        short: "m",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values.channel || !values.ts || !values.text) {
    console.error(
      'Usage: bun bot/slack/msg-update.ts --channel <channel_id> --ts <message_ts> --text "<message_text>"',
    );
    console.error(
      'Example: bun bot/slack/msg-update.ts --channel C123ABC --ts 1234567890.123456 --text "Updated message"',
    );
    process.exit(1);
  }

  await updateSlackMessage(values.channel, values.ts, values.text);
}

export { updateSlackMessage };
