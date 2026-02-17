import { WebClient } from "@slack/web-api";
import type { ChatPostMessageArguments, ChatUpdateArguments } from "@slack/web-api";
import { truncateFromMiddle } from "../utils";

/**
 * Slack message length limits
 * - Text in messages: 40,000 characters
 * - Text in section blocks with mrkdwn: 3,000 characters (Slack's actual limit)
 * - We use conservative limits to be safe
 */
const SLACK_TEXT_LIMIT = 35000; // Conservative limit for text parameter
const SLACK_MARKDOWN_BLOCK_LIMIT = 2900; // Conservative limit for markdown blocks (Slack's actual limit is 3,000)

/**
 * Safely post a message to Slack with automatic truncation on msg_too_long error
 */
type SlackBlock = Record<string, unknown> & { text?: string; type?: string };

export async function safeSlackPostMessage(
  slack: WebClient,
  params: {
    channel: string;
    text?: string;
    blocks?: SlackBlock[];
    thread_ts?: string;
    reply_broadcast?: boolean;
  },
) {
  try {
    // Pre-emptively truncate if we know it's too long
    const truncatedParams = { ...params };

    if (truncatedParams.text && truncatedParams.text.length > SLACK_TEXT_LIMIT) {
      truncatedParams.text = truncateFromMiddle(truncatedParams.text, SLACK_TEXT_LIMIT);
    }

    if (truncatedParams.blocks) {
      truncatedParams.blocks = truncatedParams.blocks.map((block) => {
        if (
          block.type === "markdown" &&
          block.text &&
          block.text.length > SLACK_MARKDOWN_BLOCK_LIMIT
        ) {
          return {
            ...block,
            text: truncateFromMiddle(block.text, SLACK_MARKDOWN_BLOCK_LIMIT),
          };
        }
        return block;
      });
    }

    return await slack.chat.postMessage({
      ...truncatedParams,
      blocks: truncatedParams.blocks || undefined,
    } as ChatPostMessageArguments);
  } catch (error: unknown) {
    // If we still get msg_too_long error, retry with more aggressive truncation
    if ((error as { data?: { error?: string } })?.data?.error === "msg_too_long") {
      console.warn("Slack msg_too_long error, retrying with aggressive truncation");

      const aggressiveParams = { ...params };

      // More aggressive truncation
      if (aggressiveParams.text) {
        aggressiveParams.text = truncateFromMiddle(aggressiveParams.text, SLACK_TEXT_LIMIT / 2);
      }

      if (aggressiveParams.blocks) {
        aggressiveParams.blocks = aggressiveParams.blocks.map((block) => {
          if (block.type === "markdown" && block.text) {
            return {
              ...block,
              text: truncateFromMiddle(block.text, SLACK_MARKDOWN_BLOCK_LIMIT / 2),
            };
          }
          return block;
        });
      }

      return await slack.chat.postMessage({
        ...aggressiveParams,
        blocks: aggressiveParams.blocks || undefined,
      } as ChatPostMessageArguments);
    }

    throw error;
  }
}

/**
 * Safely update a Slack message with automatic truncation on msg_too_long error
 */
export async function safeSlackUpdateMessage(
  slack: WebClient,
  params: {
    channel: string;
    ts: string;
    text?: string;
    blocks?: SlackBlock[];
  },
) {
  try {
    // Pre-emptively truncate if we know it's too long
    const truncatedParams = { ...params };

    if (truncatedParams.text && truncatedParams.text.length > SLACK_TEXT_LIMIT) {
      truncatedParams.text = truncateFromMiddle(truncatedParams.text, SLACK_TEXT_LIMIT);
    }

    if (truncatedParams.blocks) {
      truncatedParams.blocks = truncatedParams.blocks.map((block) => {
        if (
          block.type === "markdown" &&
          block.text &&
          block.text.length > SLACK_MARKDOWN_BLOCK_LIMIT
        ) {
          return {
            ...block,
            text: truncateFromMiddle(block.text, SLACK_MARKDOWN_BLOCK_LIMIT),
          };
        }
        return block;
      });
    }

    return await slack.chat.update({
      ...truncatedParams,
      blocks: truncatedParams.blocks || undefined,
    } as ChatUpdateArguments);
  } catch (error: unknown) {
    // If we still get msg_too_long error, retry with more aggressive truncation
    if ((error as { data?: { error?: string } })?.data?.error === "msg_too_long") {
      console.warn("Slack msg_too_long error, retrying with aggressive truncation");

      const aggressiveParams = { ...params };

      // More aggressive truncation
      if (aggressiveParams.text) {
        aggressiveParams.text = truncateFromMiddle(aggressiveParams.text, SLACK_TEXT_LIMIT / 2);
      }

      if (aggressiveParams.blocks) {
        aggressiveParams.blocks = aggressiveParams.blocks.map((block) => {
          if (block.type === "markdown" && block.text) {
            return {
              ...block,
              text: truncateFromMiddle(block.text, SLACK_MARKDOWN_BLOCK_LIMIT / 2),
            };
          }
          return block;
        });
      }

      return await slack.chat.update({
        ...aggressiveParams,
        blocks: aggressiveParams.blocks || undefined,
      } as ChatUpdateArguments);
    }

    throw error;
  }
}
