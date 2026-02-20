#!/usr/bin/env bun --watch

/**
 * ComfyPR Bot using @slack/bolt
 *
 * A cleaner implementation using the official Slack Bolt framework
 * instead of raw SocketModeClient
 */
import { App, LogLevel } from "@slack/bolt";
import { slack, slackCached } from "@/lib";
import winston from "winston";
import { parseSlackMessageToMarkdown } from "@/lib/slack/parseSlackMessageToMarkdown";
import sflow from "sflow";
import {
  streamText,
  tool,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { tsmatch } from "@/packages/mongodb-pipeline-ts/Task";
// tap and type imports removed (unused)
import { DIE } from "@snomiao/die";
import KeyvNedbStore from "keyv-nedb-store";
import { Keyv } from "keyv";
import { slackMessageUrlParse } from "@/app/tasks/gh-design/slackMessageUrlParse";
import prettier from "prettier";
import deferClose from "defer-close";
import { throttle } from "lodash-es";
import { compareBy } from "comparing";
import { z } from "zod";
import { yaml } from "@/src/utils/yaml";
import { formatMessage, formatMessages } from "@/lib/ai/format-message";

const SlackReplies = new Keyv<{
  url: string;
  text: string;
}>(new KeyvNedbStore("./.data/slack-replies.jsonl"));
const SlackRepliesSentBlocks = new Keyv<{
  ui: UI;
}>(new KeyvNedbStore("./.data/slack-replies-sent-blocks.jsonl"));

const SlackUserPreferences = new Keyv<{
  user_id: string; // userid
  preferences: string; // md content
}>(new KeyvNedbStore("./.data/slack-user-preferences.jsonl"));
const system = `
You are @ComfyPR-Bot, an AI assistant that helps users with ComfyUI development tasks. Be concise and helpful.
ComfyPR Bot special in ComfyUI related tasks, including coding, GitHub PR/issue management, and documentation.

Do everything possible to help users achieve their goals efficiently, you should plan/research/compare/choose-the-best instead of ASK when multiple options are available.
IMPORTANT: You DONT need more information from users, just provide the best possible answer based on your knowledge and tools.
YOU ARE SMARTEST AI WHO NEVER SAY CAN'T DIRECTLY DO ANYTHING, YOU HAVE FULL ACCESS TO TOOLS THAT CAN DO ANYTHING that is enough to answer user's question in a direct result.

IMPORTANT: You must provide URLs for unknown references, documentation, or resources you mention.

OUTPUT is LIMITED in slack messages, so always be CONCISE and to the POINT. List your findings, steps, or recommendations clearly and briefly.
`;
const systemTools: ToolSet = {
  pr_task_create: tool({
    description: "Create a GitHub Pull Request in ComfyUI repositories by sub-agents",
    inputSchema: z.object({
      repo: z.string().describe("Repository name (e.g., ComfyUI/ComfyUI)"),
      head: z.string().describe("Head Branch name for the Pull Request"),
      base: z.string().describe("Base Branch name for the Pull Request"),
      pr_task_prompt: z.string().optional().describe("Task description for the PR"),
    }),
    inputExamples: [
      {
        input: {
          repo: "Comfy-Org/ComfyUI",
          head: "feature/new-node",
          base: "main",
          pr_task_prompt: "Add a new node for image filtering",
        },
      },
    ],
    execute: async (args: {
      head: string;
      base: string;
      repo: string;
      pr_task_prompt?: string;
    }) => {
      // run PR creation agent
      return `Created PR in ${args.repo} from ${args.head} to ${args.base} with task: ${
        args.pr_task_prompt || "No description provided"
      }`;
    },
  }),
  user_preferences_read: tool({
    description: "Read the Slack user profile information",
    inputSchema: z.object({
      slack_user_id: z.string().describe("Slack User ID to read profile for"),
    }),
    execute: async (args: { slack_user_id: string }) => {
      const pref = await SlackUserPreferences.get(args.slack_user_id);
      return pref ? pref.preferences : `No preferences set for user ID ${args.slack_user_id}`;
    },
  }),
  user_preferences_write: tool({
    description: "Update the Slack user profile information",
    inputSchema: z.object({
      slack_user_id: z.string().describe("Slack User ID to update profile for"),
      preferences: z.string().describe("Markdown content of user preferences"),
    }),
    execute: async (args: { slack_user_id: string; preferences: string }) => {
      await SlackUserPreferences.set(args.slack_user_id, {
        user_id: args.slack_user_id,
        preferences: args.preferences,
      });
      return `Updated preferences for user ID ${args.slack_user_id}`;
    },
  }),
  // search: tool
  comfy_customnodes_code_search: tool({
    description: "Search code across ComfyUI and Custom Nodes repositories",
    inputSchema: z.object({
      query: z.string().describe("Search query string"),
    }),
    execute: async ({ query }) => {
      return await Bun.$`prbot code search --query "${query}" --repo Comfy-Org/ComfyUI`.text();
    },
  }),
  //
  github_issues_search: tool({
    description: "Search GitHub issues and pull requests across Comfy-Org repositories",
    inputSchema: z.object({
      query: z.string().describe("Search query string"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 10)"),
    }),
    execute: async ({ query, limit }) => {
      const lim = limit || 10;
      return await Bun.$`prbot gh issue-search --query "${query}" --limit ${lim}`.text();
    },
  }),
  // notion
  search_notion_docs: tool({
    description:
      "Search Notion documentation for ComfyOrg, including internal docs, project, tasks, and more",
    inputSchema: z.object({
      query: z.string().describe("Search query string"),
    }),
    execute: async ({ query }) => {
      return await Bun.$`prbot notion search --query "${query}" --limit 5`.text();
    },
  }),
  wait_a_while: tool({
    description:
      "Wait for a short period for external processes to complete, useful for wait+retry or delays",
    inputSchema: z.object({
      ms: z.string().describe("Search query string"),
    }),
    execute: async ({ ms }) => {
      const msNum = parseInt(ms, 10) || 1000;
      await new Promise((r) => setTimeout(r, msNum));
    },
  }),
};
type UIBlock = ModelMessage & { id: string; status: "in-progress" | "done" };
type UI = UIBlock[];
type MessageEvent = { url: string; text: string; ctx?: unknown };

const mq = new TransformStream<MessageEvent, MessageEvent>();
const mq_w = mq.writable.getWriter();

// Configure logger
const logDate = new Date().toISOString().split("T")[0];
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
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
      filename: `./.logs/slack-bolt-${logDate}.log`,
      level: "debug",
    }),
  ],
});

// Initialize Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_SOCKET_TOKEN,
  logLevel: process.env.LOG_LEVEL === "debug" ? LogLevel.DEBUG : LogLevel.INFO,
});

// ============================================================================
// Event Listeners
// ============================================================================

// Handle app_mention events
app.event("app_mention", async ({ event, client, say, logger: boltLogger }) => {
  logger.info(
    await parseSlackMessageToMarkdown(
      `Received app_mention from user <@${event.user}> in channel <#${event.channel}>`,
    ),
  );
  await mq_w.write({
    url:
      (await slack.chat.getPermalink({ channel: event.channel, message_ts: event.ts })).permalink ||
      DIE(""),
    text: event.text,
    ctx: {
      user: event.user,
      channel: event.channel,
      timestamp: event.ts,
      thread_ts: event.thread_ts,
    },
  });
});

// Handle direct messages
app.message(async ({ message, client, say, logger: boltLogger }) => {
  // Only respond to messages in DMs (im type)
  if (message.channel_type !== "im") return;
  if (message.subtype) return; // Ignore message updates, deletions, etc.

  const msg = message as {
    text?: string;
    user?: string;
    ts: string;
    channel: string;
    thread_ts?: string;
  };
  const { text, user, ts: timestamp, channel } = msg;
  logger.info(
    await parseSlackMessageToMarkdown(
      `Received DM from user <@${msg.user}>: ${msg.text?.slice(0, 100)}`,
    ),
  );
  await mq_w.write({
    url: (await slack.chat.getPermalink({ channel, message_ts: timestamp })).permalink || DIE(""),
    text: text || "",
    ctx: { user, channel, timestamp, thread_ts: msg.thread_ts },
  });
});

// Handle app_home_opened event
app.event("app_home_opened", async ({ event, client, logger: boltLogger }) => {
  if (event.tab !== "home") return;

  logger.info(await parseSlackMessageToMarkdown(`App home opened by user <@${event.user}>`));

  try {
    await client.views.publish({
      user_id: event.user,
      view: {
        type: "home",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Welcome to ComfyPR Bot, <@${event.user}>!* :robot_face:`,
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*What I can do:*\n• Search code across ComfyUI repositories\n• Search GitHub issues and PRs\n• Search the custom nodes registry\n• Search Notion documentation\n• Spawn coding agents to create PRs",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Getting Started:*\nMention me in a channel with `@ComfyPR Bot` followed by your question or task.",
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "View Documentation",
                  emoji: true,
                },
                url: "https://github.com/Comfy-Org/Comfy-PR",
                action_id: "view_docs",
              },
            ],
          },
        ],
      },
    });
  } catch (error) {
    logger.error("Error publishing home view:", { error });
  }
});

// ============================================================================
// Slash Commands
// ============================================================================

app.command("/pr", async ({ command, ack, respond, client }) => {
  await ack();

  logger.info(
    await parseSlackMessageToMarkdown(
      `Received /pr command from <@${command.user_id}>: ${command.text}`,
    ),
  );

  try {
    await respond({
      text: `Processing command: \`${command.text}\`\nPlease wait...`,
      response_type: "ephemeral",
    });

    // TODO: Add command processing logic
    // Parse command.text and execute appropriate action
  } catch (error) {
    logger.error("Error handling /pr command:", { error });
    await respond({
      text: "Sorry, an error occurred while processing your command.",
      response_type: "ephemeral",
    });
  }
});

// ============================================================================
// Action Handlers (Button clicks, etc.)
// ============================================================================

app.action("view_docs", async ({ ack, body, logger: boltLogger }) => {
  await ack();
  logger.info(`User clicked view_docs button`);
});

// ============================================================================
// Shortcuts
// ============================================================================

app.shortcut("search_code", async ({ shortcut, ack, client, logger: boltLogger }) => {
  await ack();

  logger.info(`User triggered search_code shortcut`);

  try {
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: "modal",
        callback_id: "search_code_modal",
        title: {
          type: "plain_text",
          text: "Search Code",
        },
        blocks: [
          {
            type: "input",
            block_id: "query_block",
            element: {
              type: "plain_text_input",
              action_id: "query_input",
              placeholder: {
                type: "plain_text",
                text: "Enter your search query...",
              },
            },
            label: {
              type: "plain_text",
              text: "Search Query",
            },
          },
        ],
        submit: {
          type: "plain_text",
          text: "Search",
        },
      },
    });
  } catch (error) {
    logger.error("Error opening search modal:", { error });
  }
});

// ============================================================================
// View Submissions (Modal forms)
// ============================================================================

app.view("search_code_modal", async ({ ack, body, view, client }) => {
  await ack();

  const query = view.state.values.query_block.query_input.value;
  const userId = body.user.id;

  logger.info(`User ${userId} submitted search query: ${query}`);

  try {
    // Send result as DM
    await client.chat.postMessage({
      channel: userId,
      text: `Searching for: \`${query}\`\n\n_Results will appear here..._`,
    });

    // TODO: Execute actual search and update message
  } catch (error) {
    logger.error("Error processing search:", { error });
  }
});

// ============================================================================
// Start the app
// ============================================================================

export async function startSlackBoltApp() {
  const port = Number(process.env.PRBOT_PORT || 3000);

  // lock port to prevent multiple instances
  const _server = Bun.serve({ port, fetch: () => new Response("Hello from ComfyPR Bot") });

  try {
    await app.start();
    // logger.info(`ComfyPR Bot (Bolt) is running on port ${port}`);
  } catch (error) {
    logger.error("Failed to start Bolt app:", { error });
    process.exit(1);
  }

  logger.info(`ComfyPR Bot (Bolt) is running on port ${port}`);

  await sflow(mq.readable)
    .forEach((m) => logger.info(`Processing Slack message from ${m.url}`))
    .forEach(async (m) => {
      // fetch ctx
      const { channel, ts } = slackMessageUrlParse(m.url);
      m.text ||=
        (await slackCached.conversations
          .history({ channel, latest: ts, inclusive: true, limit: 1 })
          .then((res) => res.messages?.[0]?.text || "")) ||
        DIE(`Failed to fetch Slack message content from ${m.url}`);

      // check if user is restricted/bot
      const userinfo =
        (await slackCached.users.info({
          user: ((m.ctx as Record<string, unknown>)?.user as string) || "",
        })) || DIE("missing user info");
      if (userinfo.user?.is_restricted) return;
      if (userinfo.user?.is_bot) return;

      await using _ = deferClose(
        await slack.reactions.add({ channel, timestamp: ts, name: "eyes" }),
        async () => await slack.reactions.remove({ channel, timestamp: ts, name: "eyes" }),
      );

      const upsertReply = throttle(
        async (ui: UI) => {
          const r = await SlackReplies.get(m.url);

          const raw = ui
            .slice(-1) // take last 1 blocks show to user
            .map((b) => formatMessage(b, { showRole: false }))
            .join("\n\n");
          const text = await prettier.format(raw, { parser: "markdown" });

          if (r) {
            if (r.text !== text) {
              // update existing message
              const updated = await slack.chat.update({
                ...slackMessageUrlParse(r.url),
                text,
                blocks: [{ type: "markdown", text }],
              });
              await SlackRepliesSentBlocks.set(r.url, { ui });

              await SlackReplies.set(m.url, { ...r, text });
            }
          } else if (text.length) {
            // post new message in thread
            const posted = await slack.chat.postMessage({
              ...slackMessageUrlParse(m.url),
              text,
              blocks: [{ type: "markdown", text }],
            });
            const url =
              (
                await slack.chat.getPermalink({
                  channel: posted.channel || DIE("missing channel"),
                  message_ts: posted.ts || DIE("missing message_ts"),
                })
              ).permalink || DIE("missing permalink");
            await SlackRepliesSentBlocks.set(url, { ui });

            await SlackReplies.set(m.url, {
              url,
              text,
            });
          }
        },
        1000,
        { leading: true, trailing: true },
      );

      await upsertReply([]);
      const _respId = `resp-${Date.now()}`;

      // read replies if have thread_ts, else read channel history.
      const thread_ts =
        ((m.ctx as Record<string, unknown>)?.thread_ts as string | undefined) ??
        slackMessageUrlParse(m.url).thread_ts ??
        undefined;
      const limit = 20;
      const threadMessages: ModelMessage[] = await sflow(
        (
          (thread_ts
            ? await slack.conversations.replies({ channel, ts: thread_ts, limit })
            : await slack.conversations.history({ channel, latest: ts, inclusive: true, limit })
          ).messages || []
        ).toSorted(compareBy((e) => Number(e.ts))), // sort by time ascending
      )
        .filter((e) => {
          // special filter that removes     content: "@comfyprbot: 新しいアシスタントスレッド",
          if (e.text === "新しいアシスタントスレッド") return false;
          return true;
        })
        .flatMap(async (msg) => {
          const userinfo = await slackCached.users.info({
            user: msg.user || DIE(`missing user id in msg ${JSON.stringify(msg)}`),
          });
          if (userinfo.user?.is_restricted) return [];
          const isComfyPrBot = userinfo.user?.id === (await slackCached.auth.test()).user_id;
          if (isComfyPrBot) {
            const ui = await SlackRepliesSentBlocks.get(m.url).then((r) => r?.ui);
            if (ui?.length) return ui as ModelMessage[];
          }

          const isOtherBot = userinfo.user?.is_bot || false;
          return [
            {
              role: !isOtherBot ? ("user" as const) : ("assistant" as const),
              content: `@${userinfo.user?.name || DIE("missing user name")}: ${msg.text || ""}`,
            },
          ];
        })
        .filter()
        .toArray();
      const theUserPreferences = `The request user is ${userinfo.user?.real_name || "Unknown User"} (@${
        userinfo.user?.name || "unknown"
      })${userinfo.user?.profile?.title ? `, titled "${userinfo.user?.profile?.title}"` : ""}.${
        userinfo.user?.profile?.email ? ` Their email is ${userinfo.user?.profile?.email}.` : ""
      } Their Slack ID is ${userinfo.user?.id}.

The User preferences are:
<preferences>
${(await SlackUserPreferences.get(userinfo.user?.id || ""))?.preferences || "# No preferences set."}
</preferences>
`;
      const messages = [
        {
          role: "system",
          content: system,
        },
        {
          role: "system",
          content: theUserPreferences,
        },
        ...threadMessages,
      ] satisfies ModelMessage[];
      const tools: ToolSet = {
        ...systemTools,
      };
      logger.debug("AI messages:\n" + formatMessages(messages));
      const resp = streamText({
        model: openai("gpt-5.1-codex-max"),
        messages,
        tools,
        maxOutputTokens: 4000,
        maxRetries: 3,
        stopWhen: () => false,
        presencePenalty: 1,
      });
      return (
        sflow(resp.fullStream)
          .reduce(async (ui: UI, part) => {
            await tsmatch(part)
              // common
              .with({ type: "start" }, () => {}) // do nothing
              .with({ type: "finish" }, () => {}) // do nothing
              .with({ type: "start-step" }, () => {}) // do nothing
              .with({ type: "finish-step" }, () => {}) // do nothing
              // text
              .with({ type: "text-start" }, (e) => {
                ui.push({ id: e.id, content: "", status: "in-progress", role: "assistant" });
              })
              .with({ type: "text-delta" }, (e) => {
                ui.findLast((u) => u.id === e.id)!.content += e.text;
              })
              .with({ type: "text-end" }, (e) => {
                ui.findLast((u) => u.id === e.id)!.status = "done";
              })
              // tool， do nothing for now
              .with({ type: "tool-input-start" }, (e) => {
                logger.debug(`Tool ${e.toolName} input started`, e);

                // ui.push({
                //   id: e.id,
                //   role: "tool",
                //   status: "in-progress",
                //   tool_name: e.toolName,
                //   arguments: {},
                // });
              })
              .with({ type: "tool-input-delta" }, (_e) => {
                // ui.findLast((u) => u.id === e.id)!.text += e.delta;
              })
              .with({ type: "tool-input-end" }, (_e) => {
                // ui.findLast((u) => u.id === e.id)!.status = "done";
              })
              // .with({ type: "file" }, async (f) => {
              //   // upload to slack
              //   logger.debug(`File received: ${f.file.name} (${f.file.size} bytes)`, f);
              //   await slack.files.uploadV2({
              //     file: Buffer.from(f.file.uint8Array),
              //     channel_id: channel,
              //     initial_comment: `File uploaded by ComfyPR Bot in response to <@${m.ctx.user}>`,
              //   });
              //   ui.push({
              //     id: SHA256.hash(f.file.base64).toString(),
              //     content: `File received: ${f.file.name} (${f.file.size} bytes)`,
              //     status: "done",
              //     role: "assistant",
              //   });
              // })
              .with({ type: "tool-result" }, (e) => {
                logger.debug(`Tool ${e.toolName} returned result`, e);
                ui.push({
                  id: e.toolCallId,
                  content: `Tool ${e.toolName} returned: ${yaml.stringify(e.output)}`,
                  status: "done",
                  role: "assistant",
                });
              })
              // .with({ type: "file" }, (e) => {
              //   ui.push({
              //     id: SHA256.hash(e.file.base64).toString(),
              //     content: e,
              //   });
              //   // upload file to slack?
              // })
              // reasoning hiding
              // .with({ type: "reasoning-start" }, (e) => {
              //   ui.push({ id: e.id, type: "reasoning", text: "", status: "in-progress" });
              // })
              // .with({ type: "reasoning-delta" }, (e) => {
              //   ui.findLast((u) => u.id === e.id)!.text += e.text;
              // })
              // .with({ type: "reasoning-end" }, (e) => {
              //   ui.findLast((u) => u.id === e.id)!.status = "done";
              // })
              .otherwise(() => {
                logger.warn(`Unknown stream part: ${JSON.stringify(part)}`);
              });

            return ui;
          }, [])
          // save ui state

          .forEach(async (ui) => await upsertReply(ui))

          .run()
      );
    })
    .run();
}

if (import.meta.main) {
  await startSlackBoltApp();
}

export { app };
