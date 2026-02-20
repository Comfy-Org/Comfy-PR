#!/usr/bin/env bun
/**
 * Status display for ComfyPR Bot using Ink
 * Renders received Slack messages in a nice terminal UI
 * Reads real data from SlackBotState
 */

import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import { z } from "zod";
import { SlackBotState } from "./state";
import { SLACK_ORG_DOMAIN_NAME } from "./slack-bot";
import terminalLink from "terminal-link";
import { getSlackCached } from "@/lib/slack/slackCached";
import { parseSlackMessageToMarkdown } from "@/lib/slack/parseSlackMessageToMarkdown";

// Slack message type from slack-bot.ts
const zSlackBlock = z
  .object({
    type: z.string(),
    block_id: z.string().optional(),
    elements: z.array(z.unknown()).optional(),
  })
  .passthrough();

const zSlackAttachment = z
  .object({
    title: z.string().optional(),
    title_link: z.string().optional(),
    text: z.string().optional(),
    fallback: z.string().optional(),
    image_url: z.string().optional(),
    from_url: z.string().optional(),
  })
  .passthrough();

const zAppMentionEvent = z.object({
  type: z.literal("app_mention"),
  user: z.string(),
  ts: z.string(),
  client_msg_id: z.string().optional(),
  text: z.string(),
  team: z.string(),
  thread_ts: z.string().optional(),
  parent_user_id: z.string().optional(),
  blocks: z.array(zSlackBlock),
  channel: z.string(),
  assistant_thread: z.unknown().optional(),
  attachments: z.array(zSlackAttachment).optional(),
  event_ts: z.string(),
});

type AppMentionEvent = z.infer<typeof zAppMentionEvent>;

interface TaskState {
  status?:
    | "checking"
    | "thinking"
    | "done"
    | "stopped_by_user"
    | "forward_to_pr_bot_channel"
    | string;
  event?: AppMentionEvent;
  startTime?: number; // Timestamp when task started
  endTime?: number; // Timestamp when task finished
  responseDuration?: number; // Duration in milliseconds
}

interface StatusMessage {
  event: AppMentionEvent;
  timestamp: Date;
  status: "received" | "processing" | "done" | "error" | "stopped" | "timeout";
  workspaceId: string;
  username?: string;
  channelName?: string;
  parsedMessage?: string;
  quickRespondMsg?: {
    ts: string;
    text: string;
    channel?: string;
    url?: string;
  };
  responseDuration?: number; // Duration in milliseconds
}

interface StatusProps {
  messages: StatusMessage[];
}

const MessageItem: React.FC<{ message: StatusMessage; index: number }> = ({ message, index }) => {
  const statusColors = {
    received: "blue",
    processing: "yellow",
    done: "green",
    error: "red",
    stopped: "gray",
    timeout: "magenta",
  } as const;

  const statusIcons = {
    received: "👀",
    processing: "⚙️",
    done: "✅",
    error: "❌",
    stopped: "⏹️",
    timeout: "⏱️",
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString("en-US", { hour12: false });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return null;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Create clickable URLs using terminal-link
  const messageUrl = `https://${SLACK_ORG_DOMAIN_NAME}.slack.com/archives/${message.event.channel}/p${message.event.ts.replace(".", "")}`;
  const channelUrl = `https://${SLACK_ORG_DOMAIN_NAME}.slack.com/archives/${message.event.channel}`;
  const userUrl = `https://${SLACK_ORG_DOMAIN_NAME}.slack.com/team/${message.event.user}`;

  // Display username/channel name if available, otherwise show ID
  const userDisplay = `@${message.username || message.event.user}`;

  // For DM channels (starting with 'D'), show as #DM_username
  let channelDisplay: string;
  if (message.event.channel.startsWith("D")) {
    // It's a DM - show as #DM_username
    channelDisplay = `#DM_${message.username || message.event.user}`;
  } else {
    // Regular channel - show channel name
    channelDisplay = message.channelName ? `#${message.channelName}` : `#${message.event.channel}`;
  }

  // Calculate prefix length: "#1 ⚙ [06:44:34] "
  const indexStr = `#${index + 1}`;
  const timestampStr = `[${formatTimestamp(message.timestamp)}]`;
  const prefixLength = indexStr.length + 3 + timestampStr.length + 2; // +3 for " ⚙ ", +2 for spaces

  // Calculate channel/user length
  const channelUserStr = `${channelDisplay}/${userDisplay}: `;

  // Bot response URL (if available)
  const botRespondMsg = message.quickRespondMsg;
  const botRespondUrl = botRespondMsg?.url || null;

  // Terminal width minus prefix, channel/user, and respond link
  const terminalWidth = process.stdout.columns || 80;
  const respondLinkLength = botRespondUrl ? 10 : 0; // " [respond]" length only if link exists
  const availableForMessage =
    terminalWidth - prefixLength - channelUserStr.length - respondLinkLength - 5; // -5 for safety margin

  // Truncate message text to fit
  const rawMessage = message.parsedMessage || message.event.text;
  const cleaned = rawMessage.replace(/\s+/g, " ").trim();
  const messageText =
    cleaned.length > availableForMessage ? cleaned.slice(0, availableForMessage) + "…" : cleaned;

  const clickableMessage = terminalLink(messageText, messageUrl, { fallback: () => messageText });
  const clickableUser = terminalLink(userDisplay, userUrl, { fallback: () => userDisplay });
  const clickableChannel = terminalLink(channelDisplay, channelUrl, {
    fallback: () => channelDisplay,
  });
  const clickableRespond = botRespondUrl
    ? terminalLink("[respond]", botRespondUrl, { fallback: () => "[respond]" })
    : null;

  // Compact format: single line
  const durationStr = formatDuration(message.responseDuration);

  return (
    <Box>
      <Text bold color="cyan">
        {indexStr}
      </Text>
      <Text> </Text>
      <Text color={statusColors[message.status]}>{statusIcons[message.status]}</Text>
      <Text dimColor> {timestampStr} </Text>
      {durationStr && <Text dimColor>[{durationStr}] </Text>}
      <Text color="blue">{clickableChannel}</Text>
      <Text dimColor>/</Text>
      <Text color="magenta">{clickableUser}</Text>
      <Text>: </Text>
      <Text>{clickableMessage}</Text>
      {clickableRespond && <Text dimColor> {clickableRespond}</Text>}
    </Box>
  );
};

const StatusDisplay: React.FC<StatusProps> = ({ messages }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const stats = {
    total: messages.length,
    processing: messages.filter((m) => m.status === "processing").length,
    done: messages.filter((m) => m.status === "done").length,
    error: messages.filter((m) => m.status === "error").length,
    stopped: messages.filter((m) => m.status === "stopped").length,
    timeout: messages.filter((m) => m.status === "timeout").length,
  };

  // Calculate how many messages can fit on screen
  const terminalHeight = process.stdout.rows || 24;
  const headerLines = 3; // Dashboard header (with border: 3 lines)
  const headerMargin = 1; // marginBottom after header
  const statsLines = 1; // Statistics line
  const statsMargin = 1; // marginBottom after stats
  const boxPadding = 2; // Box padding top + bottom
  const availableLines =
    terminalHeight - headerLines - headerMargin - statsLines - statsMargin - boxPadding;

  // Calculate max scroll offset
  const maxScrollOffset = Math.max(0, messages.length - availableLines);

  // Handle keyboard input for scrolling (only if stdin supports raw mode)
  useInput(
    (input, key) => {
      if (key.upArrow) {
        setScrollOffset((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setScrollOffset((prev) => Math.min(maxScrollOffset, prev + 1));
      } else if (key.pageUp) {
        setScrollOffset((prev) => Math.max(0, prev - availableLines));
      } else if (key.pageDown) {
        setScrollOffset((prev) => Math.min(maxScrollOffset, prev + availableLines));
      } else if (input === "g") {
        // Go to top
        setScrollOffset(0);
      } else if (input === "G") {
        // Go to bottom
        setScrollOffset(maxScrollOffset);
      }
    },
    { isActive: process.stdin.isTTY && typeof process.stdin.setRawMode === "function" },
  );

  // Reset scroll offset if messages change and offset is out of bounds
  useEffect(() => {
    if (scrollOffset > maxScrollOffset) {
      setScrollOffset(maxScrollOffset);
    }
  }, [scrollOffset, maxScrollOffset]);

  // Show only messages that fit on screen, starting from scroll offset
  const visibleMessages = messages.slice(scrollOffset, scrollOffset + availableLines);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1} borderStyle="double" borderColor="green" paddingX={2}>
        <Text bold color="greenBright">
          🤖 ComfyPR Bot Status Dashboard
        </Text>
        <Text dimColor> [{currentTime.toLocaleTimeString("en-US", { hour12: false })}]</Text>
      </Box>

      <Box marginBottom={1} paddingX={1}>
        <Text>
          Total:{" "}
          <Text bold color="cyan">
            {stats.total}
          </Text>{" "}
          | Processing:{" "}
          <Text bold color="yellow">
            {stats.processing}
          </Text>{" "}
          | Done:{" "}
          <Text bold color="green">
            {stats.done}
          </Text>{" "}
          | Timeout:{" "}
          <Text bold color="magenta">
            {stats.timeout}
          </Text>{" "}
          | Stopped:{" "}
          <Text bold color="gray">
            {stats.stopped}
          </Text>{" "}
          | Errors:{" "}
          <Text bold color="red">
            {stats.error}
          </Text>
          {messages.length > availableLines && (
            <Text dimColor>
              {" "}
              | Viewing {scrollOffset + 1}-
              {Math.min(scrollOffset + availableLines, messages.length)}/{messages.length}
              {process.stdin.isTTY && typeof process.stdin.setRawMode === "function"
                ? " [↑↓ PgUp/PgDn g/G]"
                : ""}
            </Text>
          )}
        </Text>
      </Box>

      <Box flexDirection="column">
        {visibleMessages.length === 0 ? (
          <Box paddingX={1}>
            <Text dimColor>No messages yet. Waiting for events...</Text>
          </Box>
        ) : (
          visibleMessages.map((message, index) => (
            <MessageItem key={message.event.ts} message={message} index={scrollOffset + index} />
          ))
        )}
      </Box>
    </Box>
  );
};

// Cache for usernames and channel names (persistent across renders)
const userCache = new Map<string, string>();
const channelCache = new Map<string, string>();
const parsedMessageCache = new Map<string, string>();
const quickRespondMsgCache = new Map<string, { ts: string; text: string; channel?: string }>();
const fetchedMessages = new Set<string>(); // Track which messages we've fetched data for

// Main app component that reads from SlackBotState
const StatusApp: React.FC = () => {
  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        // Read current working tasks
        const workingTasks = (await SlackBotState.get("current-working-tasks")) || {
          workingMessageEvents: [],
        };
        const events = workingTasks.workingMessageEvents || [];

        // Debug logging (commented out for production)
        // console.error(`Loaded ${events.length} events from state`);

        // Build messages array
        const newMessages: StatusMessage[] = [];

        for (const event of events) {
          const workspaceId = event.thread_ts || event.ts;
          const taskState: TaskState = (await SlackBotState.get(`task-${workspaceId}`)) || {};

          // Map task status to display status
          let displayStatus: StatusMessage["status"] = "received";
          if (taskState.status === "done") {
            displayStatus = "done";
          } else if (taskState.status === "thinking" || taskState.status === "checking") {
            displayStatus = "processing";
          } else if (taskState.status === "stopped_by_user") {
            displayStatus = "stopped";
          }

          // Parse timestamp from event.ts (format: "1234567890.123456")
          const tsSeconds = parseFloat(event.ts);
          const timestamp = new Date(tsSeconds * 1000);

          // Check for timeout: if processing for more than 1 hour
          const oneHourAgo = Date.now() - 60 * 60 * 1000;
          if (displayStatus === "processing" && timestamp.getTime() < oneHourAgo) {
            displayStatus = "timeout";
          }

          // Get cached names if available, otherwise fetch in background
          let username = userCache.get(event.user);
          let channelName = channelCache.get(event.channel);
          let parsedMessage = parsedMessageCache.get(event.ts);
          let quickRespondMsg = quickRespondMsgCache.get(event.ts);

          // Only fetch data once per message (using Set to track)
          if (!fetchedMessages.has(event.ts)) {
            fetchedMessages.add(event.ts);

            // Collect all promises for this message
            const fetchPromises: Promise<void>[] = [];

            // Fetch username if not cached
            if (!username) {
              fetchPromises.push(
                getSlackCached()
                  .users.info({ user: event.user })
                  .then((userInfo) => {
                    if (userInfo.ok && userInfo.user) {
                      const name =
                        userInfo.user.profile?.display_name ||
                        userInfo.user.real_name ||
                        userInfo.user.name ||
                        event.user;
                      userCache.set(event.user, name);
                    }
                  })
                  .catch(() => {
                    // Ignore errors
                  }),
              );
            }

            // Fetch channel name if not cached
            if (!channelName) {
              fetchPromises.push(
                getSlackCached()
                  .conversations.info({ channel: event.channel })
                  .then((channelInfo) => {
                    if (channelInfo.ok && channelInfo.channel) {
                      const name = channelInfo.channel.name || event.channel;
                      channelCache.set(event.channel, name);
                    }
                  })
                  .catch(() => {
                    // Ignore errors
                  }),
              );
            }

            // Parse message text
            if (!parsedMessage) {
              fetchPromises.push(
                parseSlackMessageToMarkdown(event.text)
                  .then((parsed) => {
                    parsedMessageCache.set(event.ts, parsed);
                  })
                  .catch(() => {
                    // Ignore parsing errors
                  }),
              );
            }

            // Fetch quickRespondMsg if not cached
            if (!quickRespondMsg) {
              const eventId = event.channel + "_" + event.ts;
              fetchPromises.push(
                SlackBotState.get(`task-quick-respond-msg-${eventId}`)
                  .then(
                    (respondMsg: { ts: string; text: string; channel?: string } | undefined) => {
                      if (respondMsg) {
                        quickRespondMsgCache.set(event.ts, respondMsg);
                      }
                    },
                  )
                  .catch(() => {
                    // Ignore errors (message might not have response yet)
                  }),
              );
            }

            // When all fetches complete, trigger a single update
            if (fetchPromises.length > 0) {
              Promise.all(fetchPromises).then(() => {
                forceUpdate((n) => n + 1);
              });
            }
          }

          newMessages.push({
            event,
            timestamp,
            status: displayStatus,
            workspaceId,
            username,
            channelName,
            parsedMessage,
            quickRespondMsg,
            responseDuration: taskState.responseDuration,
          });
        }

        // Sort by timestamp descending (newest first)
        newMessages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        // Only update if something actually changed
        const hasChanged =
          messages.length !== newMessages.length ||
          messages.some((old, idx) => {
            const newer = newMessages[idx];
            return (
              old.event.ts !== newer?.event.ts ||
              old.username !== newer?.username ||
              old.channelName !== newer?.channelName ||
              old.parsedMessage !== newer?.parsedMessage ||
              old.status !== newer?.status ||
              old.quickRespondMsg?.ts !== newer?.quickRespondMsg?.ts ||
              old.responseDuration !== newer?.responseDuration
            );
          });

        if (hasChanged) {
          // console.error(`Setting ${newMessages.length} messages to display`);
          setMessages(newMessages);
        }
      } catch (error) {
        console.error("Error loading messages from state:", error);
        // console.error("Stack:", error instanceof Error ? error.stack : String(error));
      }
    };

    // Load immediately
    loadMessages();

    // Poll every 2 seconds for updates
    const interval = setInterval(loadMessages, 2000);

    return () => clearInterval(interval);
  }, []);

  return <StatusDisplay messages={messages} />;
};

// Export for use as a component in other files
export { StatusDisplay, type StatusMessage, type AppMentionEvent };

// Run when executed directly
if (import.meta.main) {
  render(<StatusApp />);
}
