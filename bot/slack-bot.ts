#!/usr/bin/env bun

/**
 * ComfyPR Bot
 * 
 * Slack 

 */
import { slack } from "@/lib";
import { yaml } from "@/src/utils/yaml";
import { SocketModeClient } from "@slack/socket-mode";
import {} from "@slack/bolt";
import DIE from "@snomiao/die";
import { compareBy } from "comparing";
import { mkdir } from "fs/promises";
import sflow from "sflow";
import winston from "winston";
import zChatCompletion from "../lib/zChat";
import z from "zod";
import { IdleWaiter } from "./IdleWaiter";
import { RestartManager } from "./RestartManager";
import { parseSlackMessageToMarkdown } from "@/lib/slack/parseSlackMessageToMarkdown";
import { slackTsToISO } from "@/lib/slack/slackTsToISO";
import { safeSlackPostMessage, safeSlackUpdateMessage } from "@/lib/slack/safeSlackMessage";
import { slackMessageUrlParse } from "@/app/tasks/gh-design/slackMessageUrlParse";
import minimist from "minimist";
import { loadClaudeMd, loadSkills } from "./templateLoader";
import { appendFile } from "fs/promises";
import fsp from "fs/promises";
import { mdFmt } from "@/app/tasks/gh-desktop-release-notification/upsertSlackMessage";
import { getSlackChannelName } from "@/lib/slack";
import { SlackBotState } from "./state";
import { ErrorCollector } from "./error-collector";
import { query, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export const SLACK_ORG_DOMAIN_NAME = "comfy-organization";
// Configure winston logger
const logDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
const logger = winston.createLogger({
  level: process.env.VERBOSE ? "debug" : process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr ? "\n" + metaStr : ""}`;
    }),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
          return `[${timestamp}] ${level}: ${message}${metaStr ? "\n" + metaStr : ""}`;
        }),
      ),
    }),
    new winston.transports.File({
      filename: `./.logs/bot-${logDate}.log`,
      level: "debug",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
          return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr ? "\n" + metaStr : ""}`;
        }),
      ),
    }),
  ],
});

const TaskInputFlows = new Map<string, TransformStream<string, string>>();
// https://comfy-pr-bot.pages.dev/
// Slack block type definition
const zSlackBlock = z
  .object({
    type: z.string(),
    block_id: z.string().optional(),
    elements: z.array(z.unknown()).optional(),
  })
  .passthrough();

// Slack attachment type definition
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

// Helper functions to manage current working tasks
async function addWorkingTask(event: z.infer<typeof zAppMentionEvent>) {
  const workingTasks = (await SlackBotState.get("current-working-tasks")) || {
    workingMessageEvents: [],
  };
  const events = workingTasks.workingMessageEvents || [];

  // Check if event already exists (by ts and channel)
  const exists = events.some(
    (e: z.infer<typeof zAppMentionEvent>) => e.ts === event.ts && e.channel === event.channel,
  );
  if (!exists) {
    events.push(event);
    await SlackBotState.set("current-working-tasks", { workingMessageEvents: events });
    logger.info(`Added task to working list: ${event.ts} (total: ${events.length})`);
  }
}

async function removeWorkingTask(event: z.infer<typeof zAppMentionEvent>) {
  const workingTasks = (await SlackBotState.get("current-working-tasks")) || {
    workingMessageEvents: [],
  };
  const events = workingTasks.workingMessageEvents || [];

  // Remove event by ts and channel
  const filtered = events.filter(
    (e: z.infer<typeof zAppMentionEvent>) => !(e.ts === event.ts && e.channel === event.channel),
  );
  await SlackBotState.set("current-working-tasks", { workingMessageEvents: filtered });
  logger.info(`Removed task from working list: ${event.ts} (remaining: ${filtered.length})`);
}
const g = globalThis as typeof globalThis & { instanceId?: string; hotId?: string };
const now = new Date().toISOString();
g.instanceId ??= now;
g.hotId = now;

if (import.meta.main) {
  await startSlackBot();
}

export async function startSlackBot() {
  console.log("Starting ComfyPR Bot...");
  const argv = minimist(process.argv.slice(2));
  const port = Number(process.env.PRBOT_PORT || DIE("missing env.PRBOT_PORT"));

  // Step 1: Health check (only for non-PTY launches)
  const isHumanLaunched = process.stdin.isTTY;

  if (!isHumanLaunched) {
    // Non-PTY launch (PM2): Poll for 10 seconds to ensure port is continuously unhealthy
    logger.info(`Detected non-PTY launch - polling for 10s to ensure port ${port} is unhealthy`);

    const pollDuration = 10000; // 10 seconds
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();
    let healthyInstanceFound = false;

    while (Date.now() - startTime < pollDuration) {
      try {
        const statusResp = await fetch(`http://localhost:${port}/status`, {
          signal: AbortSignal.timeout(1000),
        });

        if (statusResp.ok) {
          // Found a healthy instance - abort and exit
          const statusData = await statusResp.json();
          healthyInstanceFound = true;

          // Try to get PID of existing process
          let existingPid = "unknown";
          try {
            const lsofOutput = await Bun.$`lsof -ti:${port}`.text();
            existingPid = lsofOutput.trim();
          } catch {}

          logger.info(
            `Healthy instance detected (PID: ${existingPid}) - aborting launch to avoid conflict`,
          );
          logger.info(`Status: ${JSON.stringify(statusData)}`);
          process.exit(0);
        }
      } catch (err) {
        // Port is unhealthy/unreachable - this is expected
        logger.debug(
          `Health check: port ${port} is unhealthy (${Date.now() - startTime}ms elapsed)`,
        );
      }

      await sleep(pollInterval);
    }

    if (!healthyInstanceFound) {
      logger.info(`Port ${port} remained unhealthy for 10s - proceeding to launch`);
    }
  } else {
    // PTY launch (human): Skip health check entirely
    logger.info(`Detected PTY launch - skipping health check`);
  }

  // Step 2: Kill port and launch
  logger.info(`Killing port ${port} and starting server`);
  await Bun.$`npx -y kill-port ${port}`;

  const server = Bun.serve({
    port: port,
    fetch: async (req: Request) => {
      const url = new URL(req.url);

      if (url.pathname === "/status") {
        // Get current working tasks from state
        const workingTasks = (await SlackBotState.get("current-working-tasks")) || {
          workingMessageEvents: [],
        };
        const events = workingTasks.workingMessageEvents || [];

        // Build message URLs from events
        const processing_message_urls = events.map((event: z.infer<typeof zAppMentionEvent>) => {
          const tsForUrl = event.ts.replace(".", "");
          return `https://${SLACK_ORG_DOMAIN_NAME}.slack.com/archives/${event.channel}/p${tsForUrl}`;
        });

        const status = {
          status: TaskInputFlows.size === 0 ? "idle" : "busy",
          processing_message_urls,
          processing_message_urls_count: processing_message_urls.length,
        };

        return new Response(JSON.stringify(status, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("ComfyPR Bot is running.\n", { status: 200 });
    },
  });

  // const missedMsg = "https://comfy-organization.slack.com/archives/C09QKKXK8RX/p1767849032076329?thread_ts=1767838632.470639&cid=C09QKKXK8RX"
  // const missedMsg = "https://comfy-organization.slack.com/archives/C0A4XMHANP3/p1767893546609709?thread_ts=1767862331.962569&cid=C0A4XMHANP3"
  // await spawnBotOnSlackMessageUrl(
  //   "https://comfy-organization.slack.com/archives/D09GGTE7S00/p1769576340892099",
  // );

  const msgs = await fsp
    .readFile("./inbox.yaml", "utf-8")
    .then((s) => yaml.parse(s))
    .then((e) => z.object({ missed: z.string().array() }).parseAsync(e));
  await fsp.writeFile("./inbox.yaml", "missed: []");

  // clean the file
  //
  sflow(msgs.missed)
    .forEach((url) => spawnBotOnSlackMessageUrl(url))
    .run();

  if (argv.continue) {
    async () => {
      logger.info("BOT - --continue flag detected, resuming crashed tasks...");

      // Read current working tasks from state
      const workingTasks = (await SlackBotState.get("current-working-tasks")) || {
        workingMessageEvents: [],
      };
      const events = workingTasks.workingMessageEvents || [];

      if (events.length === 0) {
        logger.info("No working tasks to resume");
      } else {
        logger.info(`Found ${events.length} working task(s) to resume`);

        for await (const event of events) {
          if (event && event.ts) {
            logger.info(
              `Resuming task for event ${event.ts} in channel ${await getSlackChannelName(event.channel)}, text: ${event.text}`,
            );
            await spawnBotOnSlackMessageEvent(event).catch((err) => {
              logger.error(`Error resuming task for event ${event.ts}`, { err });
            });
          }
        }
      }
    };
  }

  logger.info(`Starting ComfyPR Bot... id: ${g.instanceId}, hotId: ${g.hotId}`);

  // Setup smart restart manager (only restart when bot is idle)
  if (!argv["no-watch"]) {
    const restartManager = new RestartManager({
      watchPaths: ["bot", "src", "lib"],
      isIdle: () => TaskInputFlows.size === 0,
      onRestart: () => {
        logger.warn("🔄 Restarting bot process...");
        process.exit(0);
      },
      idleCheckInterval: 5000,
      debounceDelay: 1000,
      logger: {
        info: (msg, meta) => logger.info(`[RestartManager] ${msg}`, meta),
        warn: (msg, meta) => logger.warn(`[RestartManager] ${msg}`, meta),
      },
    });
    restartManager.start();
    logger.info("Smart restart manager enabled (use --no-watch to disable)");
  }

  // Initialize Socket Mode client with app-level token
  const socketModeClient = new SocketModeClient({
    appToken: process.env.SLACK_SOCKET_TOKEN || DIE("missing env.SLACK_SOCKET_TOKEN"),
  });

  // Handle all events via events_api envelope, https://docs.slack.dev/reference/events/message
  socketModeClient
    .on("app_mention", async ({ event, body, ack }) => {
      const parsedEvent = await zAppMentionEvent.parseAsync(event);

      // Acknowledge the event as its parsed
      await ack();
      await spawnBotOnSlackMessageEvent(parsedEvent);
    })
    .on("message", async ({ event, body, ack }) => {
      // bot-1  | msg:  {"type":"message","user":"U04F3GHTG2X","ts":"1767100459.669809","client_msg_id":"2fed13c0-9739-4888-a4f6-b876c25f1407","text":"test","team":"T0462DJ9G3C","blocks":[{"type":"rich_text","block_id":"gB9fq","elements":[{"type":"rich_text_section","elements":[{"type":"text","text":"test"}]}]}],"channel":"C0A6Y4AU52L","event_ts":"1767100459.669809","channel_type":"channel"}
      // Parse the message event
      const zSlackMessage = z
        .object({
          type: z.literal("message"),
          user: z.string().optional(),
          ts: z.string().optional(),
          client_msg_id: z.string().optional(),
          text: z.string().optional(),
          team: z.string().optional(),
          thread_ts: z.string().optional(),
          parent_user_id: z.string().optional(),
          blocks: z.array(zSlackBlock).optional(),
          channel: z.string().optional(),
          channel_type: z.string().optional(),
          assistant_thread: z.unknown().optional(),
          attachments: z.array(zSlackAttachment).optional(),
          event_ts: z.string().optional(),
          bot_id: z.string().optional(),
        })
        .passthrough();

      const messageEvent = zSlackMessage.parse(event);

      logger.debug("MESSAGE EVENT", { event });
      logger.debug("parsed_text: " + (await parseSlackMessageToMarkdown(messageEvent.text || "")));

      await ack();

      // Skip bot messages
      if (messageEvent.bot_id) {
        return;
      }

      // Get my bot user ID
      const botUsername = "comfyprbot";
      // TODO: fetch botUserId by botUsername or use slack api to "get my name"
      const botUserId = process.env.SLACK_BOT_USER_ID || "U078499LK5K"; // ComfyPR-Bot user ID

      // Check if message mentions the bot
      const text = messageEvent.text || "";
      const hasBotMention = text.includes(`<@${botUserId}>`);

      // Handle DM messages (channel_type: "im") and treat them like app mentions
      const isDM = messageEvent.channel_type === "im" || messageEvent.channel_type === "mpdm";

      if (
        (isDM || hasBotMention) &&
        messageEvent.user &&
        messageEvent.text &&
        messageEvent.channel &&
        messageEvent.ts &&
        messageEvent.team &&
        messageEvent.event_ts
      ) {
        const eventType = isDM ? "DM" : "BOT MENTION";
        logger.debug(`${eventType} DETECTED - Processing message as app_mention`, {
          channel: messageEvent.channel,
          ts: messageEvent.ts,
          text: text.substring(0, 100),
        });

        const mentionEvent: z.infer<typeof zAppMentionEvent> = {
          type: "app_mention" as const,
          user: messageEvent.user,
          ts: messageEvent.ts,
          client_msg_id: messageEvent.client_msg_id,
          text: messageEvent.text,
          team: messageEvent.team,
          thread_ts: messageEvent.thread_ts,
          parent_user_id: messageEvent.parent_user_id,
          blocks: messageEvent.blocks || [],
          channel: messageEvent.channel,
          assistant_thread: messageEvent.assistant_thread,
          attachments: messageEvent.attachments,
          event_ts: messageEvent.event_ts,
        };
        await spawnBotOnSlackMessageEvent(mentionEvent);
      }
    })
    .on("error", (error) => {
      logger.error("Socket Mode error", { error });
    })
    .on("connect", () => logger.info("SOCKET - Slack connected"))
    .on("disconnect", () => logger.info("SOCKET - Slack disconnected"))
    .on("ready", () => logger.info("SOCKET - Ready to receive events"));

  logger.info("BOT - Connecting to Slack Socket Mode...");
  await socketModeClient.start();
  logger.info("BOT - socketModeClient.start() returned");
  return socketModeClient;
}
async function spawnBotOnSlackMessageEvent(event: z.infer<typeof zAppMentionEvent>) {
  // msg dedup for same content
  const eventProcessed = await SlackBotState.get(`msg-${event.ts}`);
  // if (eventProcessed?.content === event.text) return;
  if (+new Date() - (eventProcessed?.touchedAt ?? 0) <= 10e3) return; // debounce for 10s
  await SlackBotState.set(`msg-${event.ts}`, { touchedAt: +new Date(), content: event.text });

  logger.info(
    await parseSlackMessageToMarkdown(
      `SPAWN - Received Slack app_mention event in channel <#${event.channel}> from user <@${event.user}>`,
    ),
  );

  // whitelist channel name #comfypr-bot, for security reason, only runs agent against @mention messages in #comfyprbot channel
  // you can forward other channel messages to #comfyprbot if needed, and the bot will read the context from the original thread messages
  // DMs are also allowed to spawn agents directly
  const channelInfo = await slack.conversations.info({ channel: event.channel });
  const channelName = channelInfo.channel?.name;
  const isDM = channelInfo.channel?.is_im === true;
  const isAgentChannel = isDM || channelName?.match(/^(comfypr-bot|pr-bot)\b/); //starts with comfyprbot or pr-bot, will spawn agent without requireing @mention

  const user =
    (await slack.users.info({ user: event.user })).user ||
    DIE("failed to fetch user info of <@" + event.user + ">");
  if (user?.is_restricted || user?.is_ultra_restricted) {
    logger.info(`User ${event.user} is a guest user, skipping processing.`);
    return;
  }

  const username =
    user.name ||
    user.id?.replace(/(.*)/, "<@$1>") ||
    DIE("failed to get username of <@" + event.user + ">");

  // task state
  const workspaceId = event.thread_ts || event.ts;
  const eventId = event.channel + "_" + event.ts;
  logger.info(
    `Processing Slack app_mention event in channel ${event.channel} (isAgentChannel: ${isAgentChannel}) with workspaceId: ${workspaceId}`,
  );
  const botWorkingDir = `/bot/slack/${sanitized(channelName || username)}/${workspaceId.replace(".", "-")}`;
  const task = await SlackBotState.get(`task-${workspaceId}`);

  // Allow append messages to running task

  // grab 100 most nearby messages in this thread or channel
  const nearbyMessagesResp = await slack.conversations.replies({
    channel: event.channel,
    ts: workspaceId,
    limit: 100,
  });
  // Type definitions for Slack message components
  type SlackFile = {
    name?: string;
    title?: string;
    mimetype?: string;
    size?: number;
    url_private?: string;
    permalink?: string;
  };

  type SlackReaction = {
    name?: string;
    count?: number;
  };

  const nearbyMessages = (
    await sflow(nearbyMessagesResp.messages || [])
      .map(async (m) => ({
        username: await slack.users
          .info({ user: m.user || DIE("missing user id in message") })
          .then((res) => res.user?.name || "<@" + m.user + ">"),
        markdown: await parseSlackMessageToMarkdown(m.text || ""),
        ts: m.ts,
        iso: slackTsToISO(m.ts || DIE("missing ts")),
        ...(m.files &&
          m.files.length > 0 && {
            files: m.files.map((f: unknown) => {
              const file = f as SlackFile;
              return {
                name: file.name,
                title: file.title,
                mimetype: file.mimetype,
                size: file.size,
                url_private: file.url_private,
                permalink: file.permalink,
              };
            }),
          }),
        ...(m.attachments &&
          m.attachments.length > 0 && {
            attachments: await Promise.all(
              m.attachments.map(async (a: unknown) => {
                const attachment = a as z.infer<typeof zSlackAttachment>;
                // Parse from_url to extract channel name
                let from_channel: string | undefined;
                if (attachment.from_url) {
                  try {
                    const parsed = slackMessageUrlParse(attachment.from_url);
                    const channelInfo = await slack.conversations.info({ channel: parsed.channel });
                    from_channel = channelInfo.channel?.name
                      ? `#${channelInfo.channel.name}`
                      : undefined;
                  } catch {
                    // Ignore parsing errors
                  }
                }
                return {
                  title: attachment.title,
                  title_link: attachment.title_link,
                  text: attachment.text
                    ? await parseSlackMessageToMarkdown(attachment.text)
                    : undefined,
                  fallback: attachment.fallback
                    ? await parseSlackMessageToMarkdown(attachment.fallback)
                    : undefined,
                  image_url: attachment.image_url,
                  from_url: attachment.from_url,
                  from_channel, // Add resolved channel name
                };
              }),
            ),
          }),
        ...(m.reactions &&
          m.reactions.length > 0 && {
            reactions: m.reactions.map((r: unknown) => {
              const reaction = r as SlackReaction;
              return {
                name: reaction.name,
                count: reaction.count,
              };
            }),
          }),
      }))
      .toArray()
  ).toSorted(compareBy((e) => +(e.ts || 0))); // sort by ts asc

  const existedTaskInputFlow = TaskInputFlows.get(workspaceId);
  if (existedTaskInputFlow && false) {
    // disable for now, lets use --queue to serialize tasks
    // while agent still running, user sent new message in the same thread very quickly
    // lets understand the user's intent and give a quick response, and then append the msg to the existing agent input flow
    // const threadMessages = await pageFlow(undefined as undefined | string, async (cursor, limit = 100) => {
    //   const resp = await slack.conversations.replies({
    //     channel: event.channel,
    //     ts: workspaceId,
    //     cursor,
    //     limit,
    //   });
    //   return {
    //     data: resp.messages || [],
    //     next: resp.response_metadata?.next_cursor,
    //   };
    // })
    //   .flat()
    //   .map(async (m) => ({
    //     ts: slackTsToISO(m.ts || DIE("missing ts")),
    //     username: await slack.users
    //       .info({ user: m.user || DIE("missing user id in message") })
    //       .then((res) => res.user?.name || "<@" + m.user + ">"),
    //     markdown: await parseSlackMessageToMarkdown(m.text || ""),
    //   }))
    //   .toArray();

    // use LLM to understand the new message intent
    const action = await zChatCompletion(
      z.object({
        user_intent: z.string(),
        my_quick_respond: z.string(),
        stop_existing_task: z.boolean(),
        msg_to_append_to_agent: z.string(),
      }),
      { model: "gpt-4o" },
    )`
The user sent a new message in a Slack thread where I am already assisting them with an ongoing task. The new message is as follows:
${event.text}

The thread's recent messages are:
${((data: string) => {
  logger.debug("Thread messages:", { data });
  return data;
})(
  yaml.stringify(
    nearbyMessages.toSorted(compareBy((e) => +(e.ts || 0))), // sort by ts asc
  ),
)}

Based on the new message and the thread context,

Please analyze the new message and determine:
1. The user's intent behind this new message.
2. A quick response I can send to the user right away to acknowledge their new message.
3. Whether I should append this new message to the existing task's input flow for further processing.
4. Whether I should stop the existing task based on this new message.

Respond in JSON format with the following fields:
- user_intent: A brief description of the user's intent regarding the new message.
- my_quick_respond: A short message I can send to the user immediately.
- stop_existing_task: true or false, indicating whether to stop the existing task.
- msg_to_append_to_agent: The content of the new message to append to the existing task's input flow. Use empty string "" if not applicable.
`;
    logger.info("New message intent analysis", { action });

    // send quick response
    const myQuickRespondMsg = await safeSlackPostMessage(slack, {
      channel: event.channel,
      thread_ts: event.ts,
      text: action.my_quick_respond, // Fallback text for notifications
      blocks: [
        {
          type: "markdown",
          text: action.my_quick_respond,
        },
      ],
    });

    if (action.stop_existing_task) {
      // stop existing task
      TaskInputFlows.delete(workspaceId);
      await safeSlackPostMessage(slack, {
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        text: `The existing task has been stopped as per your request.`, // Fallback text for notifications
        blocks: [
          {
            type: "markdown",
            text: `The existing task has been stopped as per your request.`,
          },
        ],
      });
      await SlackBotState.set(`task-${workspaceId}`, {
        ...(await SlackBotState.get(`task-${workspaceId}`)),
        status: "stopped_by_user",
      });

      // Remove task from working list
      await removeWorkingTask(event);

      return "existing task stopped by user";
    }
    if (action.msg_to_append_to_agent && action.msg_to_append_to_agent.trim()) {
      if (!existedTaskInputFlow) {
        logger.warn("No existing task input flow found");
        return;
      }
      const w = existedTaskInputFlow!.writable.getWriter();
      await w.write(
        await parseSlackMessageToMarkdown(
          `New message from <@${event.user}> in the thread:\n${event.text}\n\nMy quick response to the user: ${action.my_quick_respond}\n\n`,
        ),
      );
      w.releaseLock();
      logger.info(`Appended new message to existing task ${workspaceId} input flow`);
      return "msg appended to existing task";
    }
    return;
  }

  const taskInputFlow = new TransformStream<string, string>();
  TaskInputFlows.set(workspaceId, taskInputFlow); // able to append more inputs later

  // mark that msg as seeing
  await SlackBotState.set(`task-${workspaceId}`, {
    ...(await SlackBotState.get(`task-${workspaceId}`)),
    status: "checking",
    event,
    startTime: Date.now(),
  });
  await slack.reactions
    .add({ name: "eyes", channel: event.channel, timestamp: event.ts })
    .catch(() => {});

  // quick-intent-detect-respond by chatgpt, give quick plan/context responds before start heavy agent work
  const resp = await zChatCompletion(
    z.object({
      user_intent: z.string(),
      my_respond_before_spawn_agent: z.string(),
      should_spawn_agent: z.boolean(),
    }),
    {
      model: "gpt-4o",
    },
  )`
The user mentioned me with the following message in Slack: ${event.text}
Based on this message, please determine the user's intent in a concise manner.
Also, provide a brief response that I can send to the user immediately to acknowledge their request.
Finally, I will spawn an agent to help with this request if necessary.

For context, Recent messages from this thread are as follows:
${nearbyMessages.map((m) => `- User ${m.username} said: ${JSON.stringify(m.markdown)}`).join("\n\n")}

Possible Context Repos:
- https://github.com/comfyanonymous/ComfyUI: The main ComfyUI repository containing the core application logic and features. Its a python backend to run unknown machine learning models and solves various machine learning tasks.
- https://github.com/Comfy-Org/ComfyUI_frontend: The frontend codebase for ComfyuUI, built with Vue and TypeScript.
- https://github.com/Comfy-Org/docs: Documentation for ComfyUI, including setup guides, tutorials, and API references.
- https://github.com/Comfy-Org/desktop: The desktop application for ComfyUI, providing a user-friendly interface and additional functionalities.
- https://github.com/Comfy-Org/registry: The registry.comfy.org, where users can share and discover ComfyUI custom-nodes, and extensions.
- https://github.com/Comfy-Org/workflow_templates: A collection of official shared workflow templates for ComfyUI to help users get started quickly.

- https://github.com/Comfy-Org/comfy-api: A RESTful API service for comfy-registry, it stores custom-node metadatas and user profile/billings informations.

- And also other repos under Comfy-Org organization on GitHub.

Respond in JSON format with the following fields:
- user_intent: A brief description of the user's intent. e.g. "The user is asking for help with setting up a CI/CD pipeline."
- my_respond_before_spawn_agent: A short message I can send to the user right away. e.g. "Got it, let me look into that for you."
- should_spawn_agent: true if further research needed
`;

  const myResponseMessage = await mdFmt(resp.my_respond_before_spawn_agent);
  // - spawn_agent?: true or false, indicating whether an agent is needed to handle this request. e.g. if the user is asking for complex tasks like searching the web, managing repositories, or interacting with other services, or need to check original thread, set this to true.
  logger.info("Intent detection response", JSON.stringify({ resp }));

  // upsert quick respond msg
  type QuickRespondMsg = { ts: string; text: string; channel?: string; url?: string };
  const quickRespondMsg = await SlackBotState.get(`task-quick-respond-msg-${eventId}`).then(
    async (existing: QuickRespondMsg | undefined) => {
      if (existing) {
        await slack.reactions
          .remove({ name: "x", channel: existing.channel!, timestamp: existing.ts! })
          .catch(() => {});

        // if its a DM, always create a new message
        // if (isDM) {
        //   const newMsg = await slack.chat.postMessage({
        //     channel: event.channel,
        //     thread_ts: event.ts,
        //     text: myResponseMessage,
        //     blocks: [
        //       {
        //         type: "markdown",
        //         text: myResponseMessage,
        //       },
        //     ],
        //   });
        //   await State.set(`task-quick-respond-msg-${eventId}`, { ts: newMsg.ts!, text: myResponseMessage });
        //   return { ...newMsg, text: myResponseMessage };
        // }
        // actually lets always post new msg for now.
        // if (true) {
        //   const newMsg = await slack.chat.postMessage({
        //     channel: event.channel,
        //     thread_ts: event.ts,
        //     text: myResponseMessage,
        //     blocks: [
        //       {
        //         type: "markdown",
        //         text: myResponseMessage,
        //       },
        //     ],
        //   });
        //   await State.set(`task-quick-respond-msg-${eventId}`, { ts: newMsg.ts!, text: myResponseMessage });
        //   return { ...newMsg, text: myResponseMessage };
        // }

        const msg = await safeSlackUpdateMessage(slack, {
          channel: event.channel,
          ts: existing.ts,
          text: myResponseMessage, // Fallback text for notifications
          blocks: [
            {
              type: "markdown",
              text: myResponseMessage,
            },
          ],
        });
        await SlackBotState.set(`task-quick-respond-msg-${eventId}`, {
          ts: existing.ts,
          text: myResponseMessage,
          channel: event.channel,
          url: `https://${SLACK_ORG_DOMAIN_NAME}.slack.com/archives/${event.channel}/p${existing.ts.replace(".", "")}`,
        });
        return { ...msg, text: myResponseMessage };
      } else {
        const newMsg = await safeSlackPostMessage(slack, {
          channel: event.channel,
          thread_ts: event.ts,
          text: myResponseMessage, // Fallback text for notifications
          blocks: [
            {
              type: "markdown",
              text: myResponseMessage,
            },
          ],
        });
        await SlackBotState.set(`task-quick-respond-msg-${eventId}`, {
          ts: newMsg.ts!,
          text: myResponseMessage,
          channel: event.channel,
          url: `https://${SLACK_ORG_DOMAIN_NAME}.slack.com/archives/${event.channel}/p${newMsg.ts!.replace(".", "")}`,
        });
        return { ...newMsg, text: myResponseMessage };
      }
    },
  );

  // and now, lets update quickRespondMsg freq until user is satisfied or agent finished its work

  // spawn agent if needed & allowed
  // if (!resp.should_spawn_agent) {
  //   // update status
  //   await slack.reactions.remove({ name: 'eyes', channel: event.channel, timestamp: event.ts, });
  //   await slack.reactions.add({ name: 'white_check_mark', channel: event.channel, timestamp: event.ts, });j
  //   await State.set(`task-${workspaceId}`, { ...await State.get(`task-${workspaceId}`), status: 'done' });
  //   return 'no agent spawned'
  // }

  // The problem not easy to solve in original thread, lets forward this message to #prbot channel, and then spawn agent using that message.
  // if (!isAgentChannel) {
  //   // update status, remove eye, add forwarding reaction
  //   await slack.reactions.remove({ name: "eyes", channel: event.channel, timestamp: event.ts }).catch(() => { });
  //   await slack.reactions.add({ name: "arrow_right", channel: event.channel, timestamp: event.ts }).catch(() => { });

  //   const originalMessageUrl = `https://${event.team}.slack.com/archives/${event.channel}/p${event.ts.replace(".", "")}`;
  //   // forward msg to #prbot channel, mention original msg user:content, and the original msg url for agent to read
  //   const agentChannelId =
  //     (await slack.conversations.list({ types: "public_channel" })).channels?.find((c) => c.name === "pr-bot")?.id ||
  //     DIE("failed to find #prbot channel id");
  //   // this is a user facing msg to tell user we are forwarding the msg
  //   const text = `Forwarded message from <@${event.user}> in <#${event.channel}>:\n${await parseSlackMessageToMarkdown(event.text)}\n\nYou can view the original message here: ${originalMessageUrl}`;
  //   const forwardedMsg = await slack.chat.postMessage({
  //     channel: agentChannelId,
  //     text,
  //   });

  //   // mention forwarded msg in original thread says I will continue there
  //   await slack.chat.update({
  //     channel: event.channel,
  //     ts: quickRespondMsg.ts!,
  //     markdown_text: `${myResponseMessage}\n\nI have forwarded your message to <#${agentChannelId}>. I will continue the research there.`,
  //   });
  //   await State.set(`task-${workspaceId}`, { ...(await State.get(`task-${workspaceId}`)), status: "forward_to_pr_bot_channel" });

  //   // process the forwarded message in agent channel
  //   return await spawnBotOnSlackMessageEvent({
  //     ...event,
  //     channel: agentChannelId,
  //     ts: forwardedMsg.ts!,
  //     thread_ts: undefined,
  //     text: forwardedMsg.text || "",
  //   });
  // }

  await SlackBotState.set(`task-${workspaceId}`, {
    ...(await SlackBotState.get(`task-${workspaceId}`)),
    status: "thinking",
    event,
  });

  // Add task to working list
  await addWorkingTask(event);

  slack.reactions
    .remove({ name: "eyes", channel: event.channel, timestamp: event.ts })
    .catch(() => {});
  slack.reactions
    .add({ name: "thinking_face", channel: event.channel, timestamp: event.ts })
    .catch(() => {});

  const CLAUDEMD = loadClaudeMd({
    EVENT_CHANNEL: event.channel,
    QUICK_RESPOND_MSG_TS: quickRespondMsg.ts!,
    USERNAME: username,
    NEARBY_MESSAGES_YAML: yaml.stringify(nearbyMessages),
    EVENT_TEXT_JSON: JSON.stringify(await parseSlackMessageToMarkdown(event.text)),
    USER_INTENT: resp.user_intent,
    MY_RESPONSE_MESSAGE_JSON: JSON.stringify(myResponseMessage),
    EVENT_THREAD_TS: event.thread_ts || event.ts,
  });

  // const taskUser = `bot-user-${workspaceId.replace(".", "-")}`;
  // const taskUser = `bot-user-${workspaceId.replace(".", "-")}`;
  await mkdir(botWorkingDir, { recursive: true });
  // todo: create a linux user for task

  // fill initial files for agent

  await Bun.write(`${botWorkingDir}/CLAUDE.md`, CLAUDEMD);

  // clone https://github.com/Comfy-Org/Comfy-PR/tree/sno-bot to ./repos/prbot (branch: sno-bot)
  const prBotRepoDir = `${botWorkingDir}/codes/Comfy-Org/pr-bot/tree/main`;
  await mkdir(prBotRepoDir, { recursive: true });
  await Bun.$`git clone --branch main https://github.com/Comfy-Org/Comfy-PR ${prBotRepoDir}`.catch(
    () => null,
  );

  // await Bun.write(`${botWorkingDir}/PROMPT.txt`, agentPrompt);

  // Add Claude Skills to working dir (.claude/skills)
  // Reference: https://docs.claude.ai/en/claude-code/skills
  const skillsBase = `${botWorkingDir}/.claude/skills`;
  await mkdir(skillsBase, { recursive: true });
  const skills = loadSkills({
    EVENT_CHANNEL: event.channel,
    QUICK_RESPOND_MSG_TS: quickRespondMsg.ts!,
    EVENT_THREAD_TS: event.thread_ts || event.ts,
  });

  for (const [dir, content] of Object.entries(skills)) {
    const p = `${skillsBase}/${dir}`;
    await mkdir(p, { recursive: true });
    await Bun.write(`${p}/SKILL.md`, content);
  }

  // Index file to make skills easy to discover alongside CLAUDE.md
  await Bun.write(
    `${botWorkingDir}/SKILLS.txt`,
    `
Available Skills (.claude/skills):
- slack-messaging: Communicate in Slack threads using prbot slack commands.
- slack-file-sharing: Upload and download files, share deliverables with users.
- github-pr-bot: Delegate all code changes via prbot pr command.
- code-search: Search ComfyUI code using prbot code search.
- github-issue-search: Search issues and PRs using prbot github-issue search.
- notion-search: Discover and cite internal Notion pages using prbot notion search.
- registry-search: Search custom nodes using prbot registry search.
- repo-reading: Clone and inspect Comfy-Org repos read-only, or use prbot code search.
- web-research: Pull in external context and cite sources.

Open the corresponding SKILL.md under .claude/skills/<name>/ for details.
`,
  );

  await Bun.write(
    `${botWorkingDir}/TODO.md`,
    `
# Task TODOs

- Analyze the user's request and gather necessary information.
- Search relevant documents, codebases, and resources using prbot CLI:
  - Code search: prbot code search --query="<search terms>" [--repo=<owner/repo>]
  - Issue search: prbot github-issue search --query="<search terms>"
  - Notion search: prbot notion search --query="<search terms>"
  - Registry search: prbot registry search --query="<search terms>"
- Coordinate with prbot agents for unknown coding tasks:
  - prbot pr --repo=<owner/repo> --prompt="<detailed coding task>"
- For each deliverable: save to ./deliverable-<name>.md then immediately upload to Slack.
- Compile findings and provide a comprehensive response to the user.

## GitHub Changes
- IMPORTANT: Remember to use the prbot CLI for unknown GitHub code changes:
  prbot pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"

## Deliverables Convention
- ALWAYS save any document, guide, report, or artifact to: ./deliverable-<name>.md
- Then IMMEDIATELY post to Slack (smart-post: short → inline message, long → file upload):
  prbot slack post --channel=<channel> --file=./deliverable-<name>.md --title="<title>" --comment="<summary>" --thread=<thread_ts>
- Examples:
  - ./deliverable-research-report.md
  - ./deliverable-analysis.md
  - ./deliverable-summary.md

## Tool Error Recovery
When a prbot CLI command fails:
1. Record error to ./TOOLS_ERRORS.md (command, error, context)
2. Read the failing tool's source in ./codes/Comfy-Org/Comfy-PR/tree/sno-bot to diagnose
3. Spawn a fix via: prbot pr --repo=Comfy-Org/Comfy-PR --prompt="Fix <tool>: <error>. Root cause: <analysis>. Fix: <change>"
4. Workaround to complete the user's task while the fix PR is open

`,
  );
  await Bun.$`code ${botWorkingDir}`.catch(() => null); // open the working dir in vscode for debugging

  const agentPrompt = `
the @${username} intented to ${resp.user_intent}
Please assist them with their request using all your resources available.

IMPORTANT WORKSPACE CONVENTIONS:
- Save ALL deliverables (documents, guides, reports, summaries, analysis, code snippets, etc.) to ./deliverable-<name>.md in the current workspace directory. For example: ./deliverable-draft-pr-guide.md, ./deliverable-research-report.md
- Log any tool errors or failures to ./TOOLS_ERRORS.md
- Keep deliverables self-contained and well-formatted so they can be shared directly with the user
`;

  // Write PROMPT.txt so claude-yes can read the user's intent
  await Bun.write(`${botWorkingDir}/PROMPT.txt`, agentPrompt);

  logger.info(`Spawning agent in ${botWorkingDir} with prompt: ${JSON.stringify(agentPrompt)}`);
  // todo: spawn in a worker user

  // Create dedicated log files for this task
  const taskLogDir = `${botWorkingDir}/.logs`;
  await mkdir(taskLogDir, { recursive: true });
  const agentLogPath = `${taskLogDir}/agent-output.log`;
  const statusLogPath = `${taskLogDir}/STATUS.txt`;

  const isDebugMode = process.env.DEBUG === "true" || process.env.DEBUG === "1";

  // Start error collector to monitor workspace for errors
  const errorLogPath = `${taskLogDir}/COLLECTED_ERRORS.md`;
  const errorCollector = new ErrorCollector({
    workspaceDir: botWorkingDir,
    outputLogPath: errorLogPath,
    onError: isDebugMode
      ? (errorPath: string, content: string) => {
          logger.warn(`Error detected in workspace: ${errorPath}`);
          logger.warn(`Error content preview: ${content.substring(0, 500)}...`);
        }
      : undefined,
    checkInterval: 10000,
  });
  await errorCollector.start();

  // --- Claude Agent SDK ---
  logger.info(
    `Spawning agent via SDK in ${botWorkingDir} with env GH_TOKEN_COMFY_PR_BOT=[REDACTED]`,
  );

  const sdkPrompt =
    "Please read PROMPT.txt and TODO.md in the current directory and complete all tasks listed there.";

  const abortController = new AbortController();

  // Handle follow-up messages: when user sends more messages in the thread,
  // pipe them to the running agent via streamInput
  let agentQuery: Query | null = null;

  // Drain taskInputFlow into the SDK agent
  const inputDrainPromise = (async () => {
    const reader = taskInputFlow.readable.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && agentQuery !== null) {
          const userMsg: SDKUserMessage = {
            type: "user" as const,
            message: { role: "user" as const, content: value },
            parent_tool_use_id: null,
            session_id: "",
          };
          await (agentQuery as Query).streamInput(
            (async function* () {
              yield userMsg;
            })(),
          );
          logger.info(`Injected follow-up message into SDK agent: ${value.slice(0, 100)}`);
        }
      }
    } catch {
      // taskInputFlow closed
    }
  })();

  // Track agent output for Slack updates
  let agentOutput = "";
  let lastSentOutput = "";
  const idleWaiter = new IdleWaiter();
  let isThinking = false;

  // Slack update logic — extracted so it can be called from interval and finally
  let lastSlackUpdateTime = 0;
  const MIN_SLACK_UPDATE_INTERVAL_MS = 10_000; // minimum 10s between LLM-synthesized updates
  const sendSlackUpdate = async () => {
    if (agentOutput === lastSentOutput || !agentOutput) return;

    const now = Date.now();
    if (now - lastSlackUpdateTime < MIN_SLACK_UPDATE_INTERVAL_MS) return;
    lastSlackUpdateTime = now;

    const news = agentOutput.slice(lastSentOutput.length);
    lastSentOutput = agentOutput;

    const my_internal_thoughts = agentOutput.split("\n").slice(-80).join("\n");
    logger.info(
      "Agent output preview: " +
        yaml.stringify({
          preview: my_internal_thoughts.slice(0, 200),
          news_preview: news.slice(0, 200),
        }),
    );

    // GPT-4o synthesis for Slack update
    const contexts = {
      my_internal_thoughts,
      news,
      user_original_intent: resp.user_intent,
      my_response_md_original: quickRespondMsg.text || "",
    };
    const updateResponseResp = (await zChatCompletion({
      my_response_md_updated: z.string(),
    })`
TASK: Update my my_response_md_original based on agent's my_internal_thoughts findings, and give me my_response_md_updated to post in slack.

RULES:
- Do not remove unknown parts from my_response_md_original that are not mentioned in my_internal_thoughts.
- Preserve markdown formatting in my_response_md_original.
- If my_internal_thoughts contains new information, append it to the relevant sections in my_response_md_original.
- If my_internal_thoughts indicates completion of a task, add a "Tasks" section at the end of my_response_md_original with - [x] mark.
- Ensure my_response_md_updated is clear and concise.
- Use **bold** to highlight new sections or important updates. Remove previously highlighted sections if they're no longer relevant.
- If all information from my_internal_thoughts is already contained in my_response_md_original, return: {my_response_md_updated: "__NOTHING_CHANGED__"}

CRITICAL FILTERING RULES (Non-negotiable):
- KEEP ONLY: User-facing progress, task completion status, findings relevant to user's intent, next steps
- REMOVE: File paths, system info, debug output, error stack traces, internal process details, development notes
- EXAMPLES OF WHAT TO REMOVE:
  - "/bot/slack/channel-id/timestamp" (internal paths)
  - "undefined/null received in chunk" (internal errors)
  - "DEBUG: ..." (debug output)
  - "✓ Created /tmp/cache/..." (internal file operations)
  - "[2026-02-20T15:10:40.123Z]" (timestamps)

TONE & LENGTH:
- KEEP message very short and informative, use url links to reference documents/repos instead of pasting large contents
- Response should be up to 16 lines maximum (agent posts long reports as .md files)
- Focus ONLY on end-user's question or intent's helpful contents
- Describe current progress in up to 7 words (less is better)
- Avoid jargon; write for non-technical users when possible

FORMAT REQUIREMENTS:
- Output in standard markdown format (GitHub flavored)
- YOU CAN ONLY change/remove/add up to 1 line per update!
- LENGTH LIMIT: Must be within 4000 characters (system will truncate if exceeding)
- MOST IMPORTANT: Keep my_response_md_original's context and formatting mostly unchanged, only update necessary lines

DO NOT:
- Ask the user questions
- Include error details (they're logged separately for developers)
- Show code blocks or technical configs
- Show internal process logs or environment variables
- Show any paths starting with "/" or "./"

- Here's Contexts in YAML for your respondse:

<task-context-yaml>
${yaml.stringify(contexts)}
</task-context-yaml>

`) as { my_response_md_updated: string };

    // Log raw response
    await appendFile(
      ".logs/my_response_md_updated.jsonl",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        workspaceId,
        stage: "raw_from_claude",
        my_response_md_updated_raw: updateResponseResp.my_response_md_updated,
        my_internal_thoughts_preview: my_internal_thoughts.slice(0, 500),
        my_response_md_original: quickRespondMsg.text || "",
      }) + "\n",
    ).catch(() => {});

    const updated_response_full = await mdFmt(
      updateResponseResp.my_response_md_updated
        .trim()
        .replace(/^__NOTHING_CHANGED__$/m, quickRespondMsg.text || ""),
    );

    // Truncate to 4000 chars from the middle
    const my_response_md_updated =
      updated_response_full.length > 4000
        ? updated_response_full.slice(0, 2000) +
          "\n\n...TRUNCATED...\n\n" +
          updated_response_full.slice(-2000)
        : updated_response_full;

    await appendFile(
      ".logs/my_response_md_updated.jsonl",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        workspaceId,
        stage: "final_processed",
        my_response_md_updated_final: my_response_md_updated,
        was_truncated: updated_response_full.length > 4000,
        original_length: updated_response_full.length,
      }) + "\n",
    ).catch(() => {});

    if (quickRespondMsg.ts && quickRespondMsg.channel) {
      await safeSlackUpdateMessage(slack, {
        channel: quickRespondMsg.channel,
        ts: quickRespondMsg.ts,
        text: my_response_md_updated,
        blocks: [{ type: "markdown", text: my_response_md_updated }],
      });
      quickRespondMsg.text = my_response_md_updated;
      await SlackBotState.set(`task-quick-respond-msg-${eventId}`, {
        ts: quickRespondMsg.ts,
        text: quickRespondMsg.text,
        channel: event.channel,
        url: `https://${SLACK_ORG_DOMAIN_NAME}.slack.com/archives/${event.channel}/p${quickRespondMsg.ts.replace(".", "")}`,
      });
    }
  };

  // Periodic Slack update interval
  const slackUpdateInterval = setInterval(sendSlackUpdate, 10e3);

  // Run the agent
  let exitCode: number | null = 0;
  try {
    agentQuery = query({
      prompt: sdkPrompt,
      options: {
        cwd: botWorkingDir,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        settingSources: ["project"], // loads CLAUDE.md from cwd
        maxTurns: 200,
        persistSession: false,
        abortController,
        env: {
          ...process.env,
          GH_TOKEN: process.env.GH_TOKEN_COMFY_PR_BOT || DIE("missing GH_TOKEN_COMFY_PR_BOT env"),
          GITHUB_TOKEN:
            process.env.GH_TOKEN_COMFY_PR_BOT || DIE("missing GH_TOKEN_COMFY_PR_BOT env"),
        },
        stderr: (data: string) => {
          logger.warn(`[agent stderr]: ${data}`);
        },
      },
    });

    await Bun.write(
      statusLogPath,
      `Started: ${new Date().toISOString()}\nStatus: Running (SDK)\nLog: ${agentLogPath}\n`,
    );

    for await (const message of agentQuery) {
      // Loading indicator management
      idleWaiter.ping();
      if (!isThinking && quickRespondMsg.ts && quickRespondMsg.channel) {
        isThinking = true;
        const msgChannel = quickRespondMsg.channel;
        const msgTs = quickRespondMsg.ts;
        slack.reactions
          .add({ name: "loading", channel: msgChannel, timestamp: msgTs })
          .catch(() => {});
        idleWaiter.wait(5e3).finally(async () => {
          await slack.reactions
            .remove({ name: "loading", channel: msgChannel, timestamp: msgTs })
            .catch(() => {});
          isThinking = false;
        });
      }

      // Process SDK messages
      if (message.type === "assistant") {
        const textBlocks = (message.message.content as Array<{ type: string; text?: string }>)
          .filter(
            (block): block is { type: "text"; text: string } =>
              block.type === "text" && typeof block.text === "string",
          )
          .map((block) => block.text);
        if (textBlocks.length > 0) {
          const text = textBlocks.join("\n");
          agentOutput += text + "\n";
          await appendFile(agentLogPath, text + "\n").catch(() => {});
          logger.debug(`Agent assistant text (${text.length} chars): ${text.slice(0, 200)}`);
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          exitCode = 0;
          logger.info(
            `Agent completed successfully. Turns: ${message.num_turns}, Cost: $${message.total_cost_usd.toFixed(4)}, Duration: ${(message.duration_ms / 1000).toFixed(1)}s`,
          );
          // Append final result to output for last Slack update
          if ("result" in message && message.result) {
            agentOutput += "\n" + message.result;
          }
        } else {
          exitCode = 1;
          const errors = "errors" in message ? (message as { errors: string[] }).errors : [];
          logger.error(
            `Agent failed (${message.subtype}). Turns: ${message.num_turns}, Errors: ${errors.join(", ")}`,
          );
        }
        await appendFile(
          agentLogPath,
          `\n--- Result: ${message.subtype} | Turns: ${message.num_turns} | Cost: $${message.total_cost_usd.toFixed(4)} ---\n`,
        ).catch(() => {});
      } else {
        // Log other message types for debugging
        logger.debug(
          `SDK message: ${message.type}${"subtype" in message ? `.${(message as { subtype: string }).subtype}` : ""}`,
        );
      }
    }
  } catch (err) {
    exitCode = 1;
    logger.error("Agent SDK error:", { err });
  } finally {
    clearInterval(slackUpdateInterval);
    // Remove loading icon if still showing
    if (isThinking && quickRespondMsg.ts && quickRespondMsg.channel) {
      await slack.reactions
        .remove({
          name: "loading",
          channel: quickRespondMsg.channel,
          timestamp: quickRespondMsg.ts,
        })
        .catch(() => {});
    }
    // Send one final Slack update with complete output
    lastSlackUpdateTime = 0; // bypass throttle for final update
    await sendSlackUpdate().catch((err) => logger.error("Final Slack update error:", { err }));
    // Cancel input drain
    abortController.abort();
  }

  TaskInputFlows.delete(workspaceId);

  // Stop error collector
  errorCollector.stop();

  // Final status
  const finalStatus = exitCode === 0 ? "Completed Successfully" : `Failed (exit code ${exitCode})`;
  await Bun.write(
    statusLogPath,
    `Status: ${finalStatus}\nEnded: ${new Date().toISOString()}\nErrors: ${errorLogPath}\n`,
  ).catch(() => {});

  if (exitCode !== 0) {
    logger.error(`claude-yes process for task ${workspaceId} exited with code ${exitCode}`);
    // those error tasks will got  retry after a restart
    // update my slack message reactions shows a cross mark and update it appending a error happened and say will retry later
    await slack.reactions
      .remove({ name: "thinking_face", channel: event.channel, timestamp: event.ts })
      .catch(() => {});
    if (quickRespondMsg.ts && quickRespondMsg.channel) {
      await slack.reactions
        .add({ name: "x", channel: quickRespondMsg.channel, timestamp: quickRespondMsg.ts })
        .catch(() => {});
      const errorText = await mdFmt(
        (quickRespondMsg.text || "") +
          `\n\n:warning: An error occurred while processing this request <@snomiao>, I will try it again later`,
      );
      await safeSlackUpdateMessage(slack, {
        channel: event.channel,
        ts: quickRespondMsg.ts,
        text: errorText, // Fallback text for notifications
        blocks: [
          {
            type: "markdown",
            text: errorText,
          },
        ],
      });
    }
  }

  // claude exited as no more inputs/outputs for a while, update the status message
  await slack.reactions
    .remove({ name: "thinking_face", channel: event.channel, timestamp: event.ts })
    .catch(() => {});
  await slack.reactions
    .add({ name: "white_check_mark", channel: event.channel, timestamp: event.ts })
    .catch(() => {});
  const taskState = await SlackBotState.get(`task-${workspaceId}`);
  const endTime = Date.now();
  const responseDuration = taskState?.startTime ? endTime - taskState.startTime : undefined;

  await SlackBotState.set(`task-${workspaceId}`, {
    ...taskState,
    status: "done",
    endTime,
    responseDuration,
  });

  // Remove task from working list
  await removeWorkingTask(event);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSlackMessageFromUrl(url: string) {
  const { ts, channel } = slackMessageUrlParse(url);
  const page = await slack.conversations.history({
    channel,
    limit: 1,
    inclusive: true,
    latest: ts,
  });
  return page.messages?.[0] || DIE("not found");
}

function commonPrefix(...args: string[]): string {
  if (args.length === 0) return "";
  let prefix = args[0];
  for (let i = 1; i < args.length; i++) {
    let j = 0;
    while (j < prefix.length && j < args[i].length && prefix[j] === args[i][j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (prefix === "") break;
  }
  return prefix;
}

/**
 * Clean terminal output by removing ANSI codes, debug info, and system paths
 * This ensures Claude only sees user-meaningful progress information
 */
function cleanTerminalOutput(text: string): string {
  // Remove ANSI color codes and escape sequences
  text = text.replace(/\x1b\[[0-9;]*m/g, "");
  text = text.replace(/\x1b\[[^m]*m/g, "");
  text = text.replace(/\u0007/g, ""); // Bell character
  text = text.replace(/\r/g, ""); // Carriage returns

  // Remove box drawing characters (Claude Code banner)
  text = text.replace(/[▐▛▜▘▝█▌▙▟▞▚░▒▓│┃├┤┬┴┼─═║╔╗╚╝╠╣╦╩╬]/g, "");

  // Filter lines to remove debug noise
  const lines = text.split("\n").filter((line) => {
    const trimmed = line.trim();

    // Skip empty or whitespace-only lines
    if (!trimmed) return true;

    // Skip timestamp-prefixed log lines (multiple formats)
    // Format 1: [2026-02-20T15:10:40.123Z]
    if (/^\[[\d\-T:.Z]+\]/.test(trimmed)) return false;
    // Format 2: 2026-02-20 15:42:09 [info]:
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\[/.test(trimmed)) return false;

    // Skip warning lines
    if (/^⚠|^Warning:|^WARN:|^\[warn\]/i.test(trimmed)) return false;

    // Skip debug/verbose/trace/info prefixed lines
    if (/^(DEBUG|VERBOSE|TRACE|INFO):/i.test(trimmed)) return false;
    if (/\[(debug|verbose|trace|info)\]:/i.test(trimmed)) return false;

    // Skip claude-yes specific output
    if (/\[claude-yes\]|claude-yes|Spawned claude|PID \d+/i.test(trimmed)) return false;
    if (/Claude Code v\d|Opus \d|Claude Max/i.test(trimmed)) return false;

    // Skip lines containing system paths anywhere
    if (/\/bot\/slack\/|\/codes\/|\.logs\/|\/repos\/|\/tmp\//i.test(trimmed)) return false;

    // Skip undefined/null error indicators
    if (/received undefined\/null|undefined\/null/i.test(trimmed)) return false;

    // Skip deprecation warnings
    if (/deprecated|--exit-on-idle|-e are deprecated/i.test(trimmed)) return false;

    // Skip pure terminal control output or lines that are mostly special chars
    if (/^(\s*|cursor\s+|bell|bel|\x07)$/i.test(trimmed)) return false;

    // Skip lines that are mostly whitespace or contain only special characters
    if (/^[\s\u2000-\u206F\u2500-\u257F]*$/.test(trimmed)) return false;

    return true;
  });

  return lines.join("\n").trim();
}
function sanitized(name: string) {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
}

export async function spawnBotOnSlackMessageUrl(url: string) {
  const { team, channel, ts } = await slackMessageUrlParse(url);
  const event = await slack.conversations
    .replies({
      channel: channel,
      ts: ts,
      limit: 1,
    })
    .then((res) => res.messages?.[0] || DIE("failed to fetch message from slack"));
  logger.info("Processing missed message " + JSON.stringify({ url, event }));
  // Parse the event to ensure it matches the expected type
  const mentionEvent = zAppMentionEvent.parse({
    ...event,
    type: "app_mention",
    user: event.user || "",
    channel: channel,
    event_ts: event.ts || ts,
  });
  await spawnBotOnSlackMessageEvent(mentionEvent);
}
