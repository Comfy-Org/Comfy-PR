#!/usr/bin/env bun --watch

import { slack } from "@/lib";
import { db } from "@/src/db";
import { yaml } from "@/src/utils/yaml";
import { SocketModeClient } from "@slack/socket-mode";
import Slack from "@slack/web-api";
import DIE from "@snomiao/die";
import { spawn } from "child_process";
import { compareBy } from "comparing";
import { fromStdio, fromWritable } from "from-node-stream";
import { mkdir } from "fs/promises";
import { Keyv } from "keyv";
import KeyvMongodbStore from "keyv-mongodb-store";
import KeyvNedbStore from "keyv-nedb-store";
import KeyvNest from "keyv-nest";
import sflow, { pageFlow } from "sflow";
import winston from "winston";
import zChatCompletion from "z-chat-completion";
import z from "zod";
import { IdleWaiter } from "./IdleWaiter";
import { parseSlackMessageToMarkdown } from "./slack/parseSlackMessageToMarkdown";
import { slackTsToISO } from "./slack/slackTsToISO";
import { tap } from "rambda";
import { slackMessageUrlParse } from "@/app/tasks/gh-design/slackMessageUrlParse";
import { execa } from "execa";
import { TerminalTextRender } from 'terminal-render'
import minimist from "minimist";
import path from "path";
import { appendFile } from "fs/promises";

// Configure winston logger
const logDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr ? '\n' + metaStr : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `[${timestamp}] ${level}: ${message}${metaStr ? '\n' + metaStr : ''}`;
        })
      )
    }),
    new winston.transports.File({
      filename: `./.logs/bot-${logDate}.log`,
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr ? '\n' + metaStr : ''}`;
        })
      )
    })
  ]
});

const State = new Keyv(
  KeyvNest(
    new Map(),
    new KeyvNedbStore("./.cache/ComfyPRBotState.nedb.yaml"),
    new KeyvMongodbStore(db.collection("ComfyPRBotState")),
  ),
  { namespace: "", serialize: undefined, deserialize: undefined },
);

const TaskInputFlows = new Map<string, TransformStream<string, string>>();
// https://comfy-pr-bot.pages.dev/
const zAppMentionEvent = z.object({
  type: z.literal("app_mention"),
  user: z.string(),
  ts: z.string(),
  client_msg_id: z.string().optional(),
  text: z.string(),
  team: z.string(),
  thread_ts: z.string().optional(),
  parent_user_id: z.string().optional(),
  blocks: z.array(z.any()),
  channel: z.string(),
  assistant_thread: z.any().optional(),
  attachments: z.array(z.any()).optional(),
  event_ts: z.string(),
});
const g = globalThis as typeof globalThis & { instanceId?: string, hotId?: string }

g.instanceId ??= new Date().toISOString()
g.hotId = new Date().toISOString()

if (import.meta.main) {
    console.log("Starting ComfyPR Bot...");
  const port = Number(process.env.PRBOT_PORT || DIE("missing env.PRBOT_PORT"))

  const server = Bun.serve({
    port: port,
    fetch: async (req: Request) => {
      return new Response('ComfyPR Bot is running.\n', { status: 200 });
    }
  })

  const argv = minimist(process.argv.slice(2));

  if (argv.continue) {
    logger.info("BOT - --continue flag detected, resuming crashed tasks...");

    try {
      const tasks = await db.collection("ComfyPRBotState").find({ "value.status": { $nin: ["done", "stopped_by_user", "forward_to_pr_bot_channel"] } }).toArray();

      for (const task of tasks) {
        const event = task.value.event;
        if (event) {
          logger.info(`Resuming task ${task.key}`);
          processSlackAppMentionEvent(event).catch(err => {
            logger.error(`Error resuming task for event ${event.ts}`, { err });
          });
        }
      }
    } catch (error) {
      logger.error('Failed to resume tasks from mongodb', { error });
      // fallback to nedb
      try {
        const nedbContent = await Bun.file('./.cache/ComfyPRBotState.nedb.yaml').text();
        const tasks = nedbContent.split('\n')
          .filter(line => line.includes('"key":"task-'))
          .map(line => JSON.parse(line))
          .filter(task => task.value.status && !['done', 'stopped_by_user', 'forward_to_pr_bot_channel'].includes(task.value.status));

        for (const task of tasks) {
          const event = task.value.event;
          if (event) {
            logger.info(`Resuming task from nedb ${task.key}`);
            processSlackAppMentionEvent(event).catch(err => {
              logger.error(`Error resuming task for event ${event.ts}`, { err });
            });
          }
        }
      }
      catch (e) {
        logger.error('Failed to resume tasks from nedb', { e });
      }
    }
  }


  logger.info(`Starting ComfyPR Bot... id: ${g.instanceId}, hotId: ${g.hotId}`);
  // console.log(await execa`claude-yes --verbose -- version`)
  // console.log(await Bun.$`claude-yes -- version`)
  // console.log(await execa`claude-yes -- version`)


  // https://comfy-organization.slack.com/archives/C0A51KF8SMU/p1767111710741919
  // Disabled test code that was causing crashes on startup
  // const testUrl = 'https://comfy-organization.slack.com/archives/C08FRPK0R8X/p1767701229552979?thread_ts=1766699838.506129&cid=C08FRPK0R8X';
  // const msg = await getSlackMessageFromUrl(testUrl)
  // logger.debug('Test message from Slack URL', { msg })

  // mock an app_mention event from msg
  // // Build a minimal zAppMentionEvent-compatible object from the fetched message
  // try {
  //   const { channel } = slackMessageUrlParse(testUrl);
  //   const parsedEvent = await zAppMentionEvent.parseAsync({
  //     type: 'app_mention',
  //     user: (msg as any).user || DIE('missing user in message'),
  //     ts: (msg as any).ts || DIE('missing ts in message'),
  //     client_msg_id: (msg as any).client_msg_id,
  //     text: (msg as any).text || '',
  //     team: (msg as any).team || 'T_UNKNOWN',
  //     thread_ts: (msg as any).thread_ts,
  //     parent_user_id: (msg as any).parent_user_id,
  //     blocks: (msg as any).blocks || [],
  //     channel,
  //     assistant_thread: (msg as any).assistant_thread,
  //     attachments: (msg as any).attachments || (msg as any).files || [],
  //     event_ts: (msg as any).event_ts || (msg as any).ts || DIE('missing event_ts/ts'),
  //   });
  //   await processSlackAppMentionEvent(parsedEvent);
  // } catch (err) {
  //   logger.warn('Failed to mock app_mention event from Slack message', { err });
  // }

  // test agent resp render
  // await sflow('')
  //   .by(fromStdio(spawn('claude-yes', ['--prompt=hello'])))
  //   // write to process.stdout
  //   .forkTo(
  //     async e => {
  //       const w = fromWritable(process.stdout);
  //       const writer = w.getWriter();
  //       await e.forEach(async chunk => {
  //         await writer.write(chunk);
  //       })
  //         .onFlush(() => writer.close())
  //         .run()
  //     }
  //   )
  //   // Render terminal text to plain text and show live updates in slack
  //   .forkTo(async e => {
  //     const tr = new TerminalTextRender()
  //     let sent = ''
  //     let last = ''

  //     // logger.info('Rendered chunk size:', rendered.length, 'lines: ', rendered.split(/\r|\n/).length);
  //     const id = setInterval(async () => {
  //       const renderedText = tr.render();
  //       console.log('Rendered Text:', renderedText);
  //       // diff from last, and send stable lines
  //       const common = commonPrefix(last, renderedText)
  //       const newStable = renderedText.slice(0, common.length);
  //       console.log({ common, newStable, last, renderedText });
  //       if (newStable !== sent) {
  //         // send update to slack
  //         const unsent = newStable.slice(sent.length);
  //         console.log(unsent)
  //         sent = newStable;
  //         const updateText = sent || "_(no output yet)_";
  //       }

  //       last = renderedText;
  //     }, 1e3);

  //     await e.forEach(async chunk => {
  //       console.log('Chunk:', (chunk).toString());
  //       const rendered = tr.write(chunk.toString())
  //     })
  //       .onFlush(() => clearInterval(id))
  //       .run()
  //   })
  //   .run()

  // Initialize Socket Mode client with app-level token
  const socketModeClient = new SocketModeClient({ appToken: process.env.SLACK_SOCKET_TOKEN || DIE("missing env.SLACK_SOCKET_TOKEN"), });

  // Handle all events via events_api envelope, https://docs.slack.dev/reference/events/message
  socketModeClient
    .on("app_mention", async ({ event, body, ack }) => {
      const parsedEvent = await zAppMentionEvent
        .parseAsync(event)

      // Acknowledge the event as its parsed
      await ack();
      await processSlackAppMentionEvent(parsedEvent);
    })
    .on("message", async ({ event, body, ack }) => {
      // bot-1  | msg:  {"type":"message","user":"U04F3GHTG2X","ts":"1767100459.669809","client_msg_id":"2fed13c0-9739-4888-a4f6-b876c25f1407","text":"test","team":"T0462DJ9G3C","blocks":[{"type":"rich_text","block_id":"gB9fq","elements":[{"type":"rich_text_section","elements":[{"type":"text","text":"test"}]}]}],"channel":"C0A6Y4AU52L","event_ts":"1767100459.669809","channel_type":"channel"}
      // const zSlackMessage = ... // TODO

      logger.debug('MESSAGE EVENT', { event });
      logger.debug('parsed_text: ' + await parseSlackMessageToMarkdown(event.text || ""));

      await ack();

      // Handle DM messages (channel_type: "im") and treat them like app mentions
      if ((event as any).channel_type === "im" && (event as any).user && (event as any).text && !(event as any).bot_id) {
        logger.debug('DM DETECTED - Processing DM message', { event });
        const dmEvent = {
          type: "app_mention" as const,
          user: (event as any).user,
          ts: (event as any).ts,
          client_msg_id: (event as any).client_msg_id,
          text: (event as any).text,
          team: (event as any).team,
          thread_ts: (event as any).thread_ts,
          parent_user_id: (event as any).parent_user_id,
          blocks: (event as any).blocks || [],
          channel: (event as any).channel,
          assistant_thread: (event as any).assistant_thread,
          attachments: (event as any).attachments,
          event_ts: (event as any).event_ts,
        };
        await processSlackAppMentionEvent(dmEvent);
      }

      if ((event as any).channel_type === "im" && (event as any).user && (event as any).text && !(event as any).bot_id) {
        logger.debug('TAGME DETECTED - Processing DM message', { event });
        const dmEvent = {
          type: "app_mention" as const,
          user: (event as any).user,
          ts: (event as any).ts,
          client_msg_id: (event as any).client_msg_id,
          text: (event as any).text,
          team: (event as any).team,
          thread_ts: (event as any).thread_ts,
          parent_user_id: (event as any).parent_user_id,
          blocks: (event as any).blocks || [],
          channel: (event as any).channel,
          assistant_thread: (event as any).assistant_thread,
          attachments: (event as any).attachments,
          event_ts: (event as any).event_ts,
        };
        await processSlackAppMentionEvent(dmEvent);
      }

    })
    .on("error", (error) => { logger.error('Socket Mode error', { error }); })
    .on('connect', () => logger.info('SOCKET - Slack connected'))
    .on('disconnect', () => logger.info('SOCKET - Slack disconnected'))
    .on('ready', () => logger.info('SOCKET - Ready to receive events'))

  logger.info('BOT - Connecting to Slack Socket Mode...')
  await socketModeClient.start();
  logger.info('BOT - socketModeClient.start() returned')

}


async function processSlackAppMentionEvent(event: {
  type: "app_mention";
  user: string;
  ts: string;
  client_msg_id?: string;
  text: string;
  team: string;
  thread_ts?: string;
  parent_user_id?: string;
  blocks: any[];
  channel: string;
  assistant_thread?: any;
  attachments?: any[];
  event_ts: string;
}) {
  // msg dedup for same content
  const eventProcessed = await State.get(`msg-${event.ts}`);
  if (eventProcessed?.content === event.text) return;
  // if (+new Date() - eventProcessed.touchedAt < 60000) return; // dedup for 1min
  await State.set(`msg-${event.ts}`, { touchedAt: +new Date(), content: event.text });

  // whitelist channel name #comfypr-bot, for security reason, only runs agent against @mention messages in #comfypr-bot channel
  // you can forward other channel messages to #comfypr-bot if needed, and the bot will read the context from the original thread messages
  // DMs are also allowed to spawn agents directly
  const channelInfo = await slack.conversations.info({ channel: event.channel });
  const channelName = channelInfo.channel?.name;
  const isDM = channelInfo.channel?.is_im === true;
  const isAgentChannel = isDM || channelName?.match(/^(comfypr-bot|pr-bot)\b/) //starts with comfypr-bot or pr-bot, will spawn agent without requireing @mention

  const username = await slack.users.info({ user: event.user }).then((res) => res.user?.name || "<@" + event.user + ">");


  // task state
  const taskId = event.thread_ts || event.ts;
  logger.info(`Processing Slack app_mention event in channel ${event.channel} (isAgentChannel: ${isAgentChannel}) with taskId: ${taskId}`);
  const botWorkingDir = `/bot/slack/${sanitized(channelName || username)}/${taskId.replace(".", "-")}`;
  const task = await State.get(`task-${taskId}`);

  // Allow append messages to running task

  // grab 100 most nearby messages in this thread or channel
  const nearbyMessagesResp = await slack.conversations.replies({
    channel: event.channel,
    ts: taskId,
    limit: 100,
  });
  const nearbyMessages = (
    await sflow(nearbyMessagesResp.messages || [])
      .map(async (m) => ({
        username: await slack.users
          .info({ user: m.user || DIE("missing user id in message") })
          .then((res) => res.user?.name || "<@" + m.user + ">"),
        markdown: await parseSlackMessageToMarkdown(m.text || ""),
        ts: m.ts,
        iso: slackTsToISO(m.ts || DIE("missing ts")),
        ...(m.files && m.files.length > 0 && {
          files: m.files.map((f: any) => ({
            name: f.name,
            title: f.title,
            mimetype: f.mimetype,
            size: f.size,
            url_private: f.url_private,
            permalink: f.permalink,
          })),
        }),
        ...(m.attachments && m.attachments.length > 0 && {
          attachments: m.attachments.map((a: any) => ({
            title: a.title,
            title_link: a.title_link,
            text: a.text,
            fallback: a.fallback,
            image_url: a.image_url,
            from_url: a.from_url,
          })),
        }),
        ...(m.reactions && m.reactions.length > 0 && {
          reactions: m.reactions.map((r: any) => ({
            name: r.name,
            count: r.count,
          })),
        }),
      }))
      .toArray()
  ).toSorted(compareBy((e) => +(e.ts || 0))); // sort by ts asc

  const existedTaskInputFlow = TaskInputFlows.get(taskId);
  if (existedTaskInputFlow && false) { // disable for now, lets use --queue to serialize tasks
    // while agent still running, user sent new message in the same thread very quickly
    // lets understand the user's intent and give a quick response, and then append the msg to the existing agent input flow
    // const threadMessages = await pageFlow(undefined as undefined | string, async (cursor, limit = 100) => {
    //   const resp = await slack.conversations.replies({
    //     channel: event.channel,
    //     ts: taskId,
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
      { model: "gpt-4o", },
    )`
The user sent a new message in a Slack thread where I am already assisting them with an ongoing task. The new message is as follows:
${event.text}

The thread's recent messages are:
${tap((data) => logger.debug('Thread messages:', { data }))(yaml.stringify(
      nearbyMessages.toSorted(compareBy((e) => +(e.ts || 0))), // sort by ts asc
    ))}

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
    const myQuickRespondMsg = await slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      markdown_text: action.my_quick_respond,
    });
    if (action.stop_existing_task) {
      // stop existing task
      TaskInputFlows.delete(taskId);
      await slack.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        markdown_text: `The existing task has been stopped as per your request.`,
      });
      await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "stopped_by_user" });
      return "existing task stopped by user";
    }
    if (action.msg_to_append_to_agent && action.msg_to_append_to_agent.trim()) {
      const w = existedTaskInputFlow.writable.getWriter();
      await w.write(
        await parseSlackMessageToMarkdown(`New message from <@${(event.user)}> in the thread:\n${event.text}\n\nMy quick response to the user: ${action.my_quick_respond}\n\n`),
      );
      w.releaseLock();
      logger.info(`Appended new message to existing task ${taskId} input flow`);
      return "msg appended to existing task";
    }
    return;
  }

  const taskInputFlow = new TransformStream<string, string>();
  if (isAgentChannel) {
    TaskInputFlows.set(taskId, taskInputFlow);
  }

  // mark that msg as seeing
  await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "checking", event });
  await slack.reactions.add({ name: "eyes", channel: event.channel, timestamp: event.ts }).catch(() => { });

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
${nearbyMessages.map((m) => `- User ${m.username} said: ${JSON.stringify(m.text)}`).join("\n\n")}

Possible Context Repos:
- https://github.com/comfyanonymous/ComfyUI: The main ComfyUI repository containing the core application logic and features. Its a python backend to run any machine learning models and solves various machine learning tasks.
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
  // - spawn_agent?: true or false, indicating whether an agent is needed to handle this request. e.g. if the user is asking for complex tasks like searching the web, managing repositories, or interacting with other services, or need to check original thread, set this to true.
  logger.info("Intent detection response", { resp });

  // upsert quick respond msg
  const quickRespondMsg = await State.get(`task-quick-respond-msg-${taskId}`).then(async (existing: any) => {
    if (existing) {
      // if its a DM, always create a new message
      if (isDM) {
        const newMsg = await slack.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          markdown_text: resp.my_respond_before_spawn_agent,
        });
        await State.set(`task-quick-respond-msg-${taskId}`, { ts: newMsg.ts!, text: resp.my_respond_before_spawn_agent });
        return { ...newMsg, markdown_text: resp.my_respond_before_spawn_agent };
      }
      // actually lets always post new msg for now.
      if (true) {
        const newMsg = await slack.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          markdown_text: resp.my_respond_before_spawn_agent,
        });
        await State.set(`task-quick-respond-msg-${taskId}`, { ts: newMsg.ts!, text: resp.my_respond_before_spawn_agent });
        return { ...newMsg, markdown_text: resp.my_respond_before_spawn_agent };
      }

      const msg = await slack.chat.update({
        channel: event.channel,
        ts: existing.ts,
        markdown_text: resp.my_respond_before_spawn_agent,
      });
      await State.set(`task-quick-respond-msg-${taskId}`, { ts: existing.ts, text: resp.my_respond_before_spawn_agent });
      return { ...msg, markdown_text: resp.my_respond_before_spawn_agent };
    } else {
      const newMsg = await slack.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        markdown_text: resp.my_respond_before_spawn_agent,
      });
      await State.set(`task-quick-respond-msg-${taskId}`, { ts: newMsg.ts!, text: resp.my_respond_before_spawn_agent });
      return { ...newMsg, markdown_text: resp.my_respond_before_spawn_agent };
    }
  });

  // and now, lets update quickRespondMsg freq until user is satisfied or agent finished its work

  // spawn agent if needed & allowed
  // if (!resp.should_spawn_agent) {
  //   // update status
  //   await slack.reactions.remove({ name: 'eyes', channel: event.channel, timestamp: event.ts, });
  //   await slack.reactions.add({ name: 'white_check_mark', channel: event.channel, timestamp: event.ts, });j
  //   await State.set(`task-${taskId}`, { ...await State.get(`task-${taskId}`), status: 'done' });
  //   return 'no agent spawned'
  // }

  // The problem not easy to solve in original thread, lets forward this message to #pr-bot channel, and then spawn agent using that message.
  // if (!isAgentChannel) {
  //   // update status, remove eye, add forwarding reaction
  //   await slack.reactions.remove({ name: "eyes", channel: event.channel, timestamp: event.ts }).catch(() => { });
  //   await slack.reactions.add({ name: "arrow_right", channel: event.channel, timestamp: event.ts }).catch(() => { });

  //   const originalMessageUrl = `https://${event.team}.slack.com/archives/${event.channel}/p${event.ts.replace(".", "")}`;
  //   // forward msg to #pr-bot channel, mention original msg user:content, and the original msg url for agent to read
  //   const agentChannelId =
  //     (await slack.conversations.list({ types: "public_channel" })).channels?.find((c) => c.name === "pr-bot")?.id ||
  //     DIE("failed to find #pr-bot channel id");
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
  //     markdown_text: `${resp.my_respond_before_spawn_agent}\n\nI have forwarded your message to <#${agentChannelId}>. I will continue the research there.`,
  //   });
  //   await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "forward_to_pr_bot_channel" });

  //   // process the forwarded message in agent channel
  //   return await processSlackAppMentionEvent({
  //     ...event,
  //     channel: agentChannelId,
  //     ts: forwardedMsg.ts!,
  //     thread_ts: undefined,
  //     text: forwardedMsg.text || "",
  //   });
  // }

  await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "thinking", event });

  slack.reactions.remove({ name: "eyes", channel: event.channel, timestamp: event.ts }).catch(() => { });
  slack.reactions.add({ name: "thinking_face", channel: event.channel, timestamp: event.ts }).catch(() => { });

  const CLAUDEMD = `
Act as @ComfyPR-Bot, belongs to @Comfy-Org made by @snomiao.
You are AI assistant integrated with Comfy-Org's many internal services including Slack, Notion, Github, CustomNode Registry.

for context, the thread context messages is:
${yaml.stringify(nearbyMessages)}

THIS TIME, THE user mentioned you with the following message:

@${username} (user): ${JSON.stringify(await parseSlackMessageToMarkdown(event.text))}

You have already determined the user's intent as follows:
IMPORTANT: YOU MUST ASSIST THE USER INTENT: ${resp.user_intent}

-- Your preliminary response to the user is:
@YOU: ${JSON.stringify(resp.my_respond_before_spawn_agent)}

Now, based on the user's intent, please do research and provide a detailed and helpful response to assist the user with their request.

Possible Context Repos:
- https://github.com/comfyanonymous/ComfyUI: The main ComfyUI repository containing the core application logic and features. Its a python backend to run any machine learning models and solves various machine learning tasks.
- https://github.com/Comfy-Org/ComfyUI_frontend: The frontend codebase for ComfyUI, built with Vue and TypeScript.
- https://github.com/Comfy-Org/docs: Documentation for ComfyUI, including setup guides, tutorials, and API references.
- https://github.com/Comfy-Org/desktop: The desktop application for ComfyUI, providing a user-friendly interface and additional functionalities.
- https://github.com/Comfy-Org/registry: The registry.comfy.org, where users can share and discover ComfyUI custom-nodes, and extensions.
- https://github.com/Comfy-Org/workflow_templates: A collection of official shared workflow templates for ComfyUI to help users get started quickly.
- https://github.com/Comfy-Org/comfy-api: A RESTful API service for comfy-registry, it stores custom-node metadatas and user profile/billings informations.
- https://github.com/Comfy-Org/team-dash: Team Dashboard for Comfy-Org, managing team projects, tasks, and collaboration.

- And also other repos under Comfy-Org organization on GitHub.

## Respond Rules
- Use markdown format for all your responses.
- If you reference code, repos, or documents, provide links to them.
- Always prioritize user privacy and data security.
- Provide rich references and citations for your information.

## Skills you have:
- Search the web for relevant information.
- github: Clone any repositories from https://github.com/Comfy-Org to ${botWorkingDir}/codes/Comfy-Org/[repo]/tree/[branch] to inspect codebases for READ-ONLY purposes.
- github: Search code across All CustomNodes/ComfyUI/ComfyOrg repositories using 'pr-bot code search --query="<search terms>" [--repo=<owner/repo>]' (NO --limit support)
- github: Search for issues and PRs using 'pr-bot github-issue search --query="<search terms>" --limit=10'
- github: To make code changes to any GitHub repository, you MUST use the pr-bot CLI: 'pr-bot pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"'
- slack: Read thread messages for context using 'bun ${process.cwd()}/bot/slack/msg-read-thread.ts --channel=${event.channel} --ts=[ts] --limit=100'
- slack: Update your response message using 'bun ${process.cwd()}/bot/slack/msg-update.ts --channel=${event.channel} --ts=${quickRespondMsg.ts!} --text="<your response here>"'
- slack: Upload files to share results using 'bun ${process.cwd()}/bot/slack/file.ts upload --channel=${event.channel} --file=<path> --comment="<message>" --thread=${quickRespondMsg.ts!}'
- notion: Search Notion docs from Comfy-Org team using 'pr-bot notion search --query="<search terms>" --limit=5'
- notion: Update notion docs by @Fennic-bot in slack channel and asking it to make the changes.
- registry: Search ComfyUI custom nodes registry using 'pr-bot registry search --query="<search terms>" --limit=5'
- Local file system: Your working directory are temp, make sure commit your work to external services like slack/github/notion where user can see it, before your ./ dir get cleaned up
- TODO.md: You can utilize TODO.md file in your working directory to track tasks and progress.

## IMPORTANT: File Sharing with Users
- When generating reports, code files, diagrams, or any deliverables, ALWAYS upload them to Slack
- Use: 'bun ${process.cwd()}/bot/slack/file.ts upload --channel=${event.channel} --file=<path> --comment="<message>" --thread=${quickRespondMsg.ts!}'
- Upload files to the same thread where the user asked the question using --thread parameter
- Common file types to share: .md (reports), .pdf (documents), .png/.jpg (diagrams/screenshots), .txt (logs), .json (data), .py/.ts/.js (code samples)
- Example: 'bun ${process.cwd()}/bot/slack/file.ts upload --channel=${event.channel} --file=./report.md --comment="Analysis complete" --thread=${quickRespondMsg.ts!}'

## IMPORTANT Constraints:
- DO NOT make any direct code changes to GitHub repositories yourself
- DO NOT create commits, branches, or pull requests directly
- ONLY use the pr-bot CLI ('pr-bot pr --repo=<owner/repo> --prompt="..."') to spawn a coding sub-agent for any GitHub modifications
- You are a RESEARCH and COORDINATION agent - delegate actual coding work to pr-bot sub-agents
- When user asks for code changes, analyze the request, then spawn a pr-bot with clear, specific instructions
- IMPORTANT: Remember to use the pr-bot CLI for any GitHub code changes.
- IMPORTANT: DONT ASK ME ANY QUESTIONS IN YOUR RESPONSE. JUST FIND NECESSARY INFORMATION USING ALL YOUR TOOLS and RESOURCES AND SHOW YOUR BEST UNDERSTANDING.
- DO NOT INCLUDE ANY internal-only info or debugging contexts, system info, any tokens, passwords, credentials.
- DO NOT INCLUDE ANY local paths in your report to users! You have to sanitize them into github url before sharing.
`;

  // const taskUser = `bot-user-${taskId.replace(".", "-")}`;
  // const taskUser = `bot-user-${taskId.replace(".", "-")}`;
  await mkdir(botWorkingDir, { recursive: true });
  // todo: create a linux user for task

  // fill initial files for agent
  await Bun.write(`${botWorkingDir}/CLAUDE.md`, CLAUDEMD);
  // await Bun.write(`${botWorkingDir}/PROMPT.txt`, agentPrompt);

  // Add Claude Skills to working dir (.claude/skills)
  // Reference: https://docs.claude.ai/en/claude-code/skills
  const skillsBase = `${botWorkingDir}/.claude/skills`;
  await mkdir(skillsBase, { recursive: true });
  const skills: Record<string, string> = {
    "slack-messaging": `---
name: Slack Thread Messaging
description: Update or append messages in Slack threads for progress updates, clarifications, and final answers.
---

# Slack Thread Messaging

Use these commands to communicate in the current Slack thread:

- Update an existing message in the thread:
  bun ${process.cwd()}/bot/slack/msg-update.ts --channel <channel_id> --ts <message_ts> --text "<message_text>"

- Read the latest context from a thread root (useful before replying):
  bun ${process.cwd()}/bot/slack/msg-read-thread.ts --channel <channel_id> --ts <root_ts> --limit 100

Examples:
  bun ${process.cwd()}/bot/slack/msg-update.ts --channel ${event.channel} --ts ${quickRespondMsg.ts!} --text "Working on it..."
  bun ${process.cwd()}/bot/slack/msg-read-thread.ts --channel ${event.channel} --ts ${event.thread_ts || event.ts} --limit 50

Guidelines:
- Acknowledge quickly; post iterative, concise updates.
- Prefer editing your last progress message instead of spamming.
- Quote or link to relevant messages for clarity.
`,
    "slack-file-sharing": `---
name: Slack File Sharing
description: Upload files and share deliverables with users in Slack threads.
---

# Slack File Sharing

Use this command to upload files in Slack:

## Upload a file to thread:
  bun ${process.cwd()}/bot/slack/file.ts upload --channel <channel_id> --file <file_path> --comment "<message>" --thread <thread_ts>

Examples:
  bun ${process.cwd()}/bot/slack/file.ts upload --channel ${event.channel} --file ./report.md --comment "Analysis complete" --thread ${quickRespondMsg.ts!}
  bun ${process.cwd()}/bot/slack/file.ts upload --channel ${event.channel} --file ./data.json --comment "Here is the data" --thread ${quickRespondMsg.ts!}

## When to upload files:
- Reports, analysis results, or documentation (.md, .pdf, .txt)
- Code samples or scripts (.py, .ts, .js, .sh)
- Diagrams, screenshots, or visualizations (.png, .jpg, .svg)
- Data exports or logs (.json, .csv, .log)
- Any deliverable the user requested

## Best practices:
- ALWAYS upload files to the thread where the user asked the question using --thread parameter
- Use descriptive file names that indicate the content
- Include a meaningful comment explaining what the file contains
- Upload files as soon as they're ready, don't wait until the end
`,
    "github-pr-bot": `---
name: GitHub Changes via pr-bot
description: Safely make code changes by spawning a coding sub-agent that opens a PR.
---

# GitHub Changes via pr-bot

All repository modifications must be delegated to the PR bot using the pr-bot CLI.

Commands:
  pr-bot pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"
  pr-bot code pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"
  pr-bot github pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"

Prompt tips:
- Describe the desired outcome and acceptance criteria.
- Specify target files/paths when known and include examples.
- Mention tests/docs to update.
`,
    "code-search": `---
name: ComfyUI Code Search
description: Search code across ComfyUI repositories using comfy-codesearch service. Including all Comfy-Org repos and Community made Custom Node Repos on GitHub.
---

# ComfyUI Code Search

Search for code patterns, functions, and implementations:
  pr-bot code search --query "<search terms>" [--repo=<owner/repo>]

NOTE: Does NOT support --limit parameter. Results are automatically paginated.

Examples:
  pr-bot code search --query "binarization" --repo Comfy-Org/ComfyUI
  pr-bot code search --query "authentication function"
  pr-bot code search --query "video transcription whisper"

Best practices:
- Use specific function names or patterns for better results.
- Specify repo when you know which repository to search.
- Review results and cite file paths and line numbers.
`,
    "github-issue-search": `---
name: GitHub Issue Search
description: Search for issues and pull requests across Comfy-Org repositories.
---

# GitHub Issue Search

Search issues and PRs across all Comfy-Org repositories:
  pr-bot github-issue search --query "<search terms>" [--limit=5]

Examples:
  pr-bot github-issue search --query "authentication bug" --limit 5
  pr-bot github-issue search --query "dark mode feature"

Best practices:
- Search for known bugs or feature requests before starting work.
- Reference issue numbers in your responses.
- Link to relevant discussions and PRs.
`,
    "notion-search": `---
name: Notion Docs Search
description: Find and cite relevant Notion pages from the Comfy-Org workspace.
---

# Notion Docs Search

Search internal docs, RFCs, and meeting notes using pr-bot CLI:
  pr-bot notion search --query "<search term>" [--limit=5]

Examples:
  pr-bot notion search --query "ComfyUI setup" --limit 5
  pr-bot notion search --query "architecture decisions"

Best practices:
- Skim titles and last-edited times; open the most recent first.
- Cite page titles and URLs in your response.
- Check for updated information before making recommendations.
`,
    "registry-search": `---
name: ComfyUI Registry Search
description: Search for custom nodes and extensions in the ComfyUI registry.
---

# ComfyUI Registry Search

Search for custom nodes and plugins:
  pr-bot registry search --query "<search terms>" [--limit=5]

Examples:
  pr-bot registry search --query "video" --limit 5
  pr-bot registry search --query "upscaling models"

Best practices:
- Search for existing custom nodes before recommending new implementations.
- Provide registry URLs for discovered nodes.
- Check compatibility and maintenance status.
`,
    "repo-reading": `---
name: Comfy-Org Repo Reading (Read-Only)
description: Clone and inspect Comfy-Org repositories for analysis and citations (no direct pushing).
---

# Comfy-Org Repo Reading (Read-Only)

Clone repositories locally for analysis (read-only):
  mkdir -p \${PROJECT_ROOT}/codes/Comfy-Org
  git clone --depth=1 https://github.com/Comfy-Org/<repo>.git \${PROJECT_ROOT}/codes/Comfy-Org/<repo>
  cd \${PROJECT_ROOT}/codes/Comfy-Org/<repo> && git checkout <branch>

Or use pr-bot code search for faster results:
  pr-bot code search --query "<search terms>" --repo Comfy-Org/<repo>

Guidelines:
- Use code search first for specific queries.
- Clone only when you need to browse full repository structure.
- Do not commit/push directly; use the PR bot for changes.
- When citing code, include file paths and line spans where helpful.
`,
    "web-research": `---
name: Web Research and Citation
description: Search public docs and issues; summarize findings concisely with citations.
---

# Web Research and Citation

When external information is needed:
- Prefer official docs, READMEs, CHANGELOGs, and issues/PRs.
- Cross-check dates and versions; prefer recent sources.
- Provide short quotes and links with clear attribution.
- Use pr-bot github-issue search for searching GitHub issues.
`
  };

  for (const [dir, content] of Object.entries(skills)) {
    const p = `${skillsBase}/${dir}`;
    await mkdir(p, { recursive: true });
    await Bun.write(`${p}/SKILL.md`, content);
  }

  // Index file to make skills easy to discover alongside CLAUDE.md
  await Bun.write(`${botWorkingDir}/SKILLS.txt`, `
Available Skills (.claude/skills):
- slack-messaging: Communicate in Slack threads using pr-bot slack commands.
- slack-file-sharing: Upload and download files, share deliverables with users.
- github-pr-bot: Delegate all code changes via pr-bot pr command.
- code-search: Search ComfyUI code using pr-bot code search.
- github-issue-search: Search issues and PRs using pr-bot github-issue search.
- notion-search: Discover and cite internal Notion pages using pr-bot notion search.
- registry-search: Search custom nodes using pr-bot registry search.
- repo-reading: Clone and inspect Comfy-Org repos read-only, or use pr-bot code search.
- web-research: Pull in external context and cite sources.

Open the corresponding SKILL.md under .claude/skills/<name>/ for details.
`);


  await Bun.write(`${botWorkingDir}/TODO.md`, `
# Task TODOs
- Analyze the user's request and gather necessary information.
- Search relevant documents, codebases, and resources using pr-bot CLI:
  - Code search: pr-bot code search --query="<search terms>" [--repo=<owner/repo>]
  - Issue search: pr-bot github-issue search --query="<search terms>"
  - Notion search: pr-bot notion search --query="<search terms>"
  - Registry search: pr-bot registry search --query="<search terms>"
- Coordinate with pr-bot agents for any coding tasks:
  - pr-bot pr --repo=<owner/repo> --prompt="<detailed coding task>"
- Compile findings and provide a comprehensive response to the user.

## Communication
- IMPORTANT: Keep the user informed of your progress by updating the Slack thread frequently:
  pr-bot slack update --channel=${event.channel} --ts=${quickRespondMsg.ts!} --text="<your response here>"

## GitHub Changes
- IMPORTANT: Remember to use the pr-bot CLI for any GitHub code changes:
  pr-bot pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"

`);
  await Bun.$`code ${botWorkingDir}` // open the working dir in vscode for debugging

  const agentPrompt = `
@${username} intented to ${resp.user_intent}
Please assist them with their request using all your resources available.
`
  logger.info(`Spawning agent in ${botWorkingDir} with prompt: ${JSON.stringify(agentPrompt)}`);
  // todo: spawn in a worker user

  // await Bun.$.cwd(botWorkingDir)`claude-yes -- solve-everything-in=TODO.md, PROMPT.txt, current bot args --working-dir=${botWorkingDir} --slack-channel=${event.channel} --slack-thread-ts=${quickRespondMsg.ts!}`

  // create a user for task
  const p = (() => {
    const cli = 'codex-yes'
    const p = spawn(cli, ['--queue', '-i=1min', "--prompt", agentPrompt], {
      cwd: botWorkingDir,
      // stdio: 'inherit'
      // env: { ...process.env, }
    })

    // check if p spawned successfully
    p.on("error", (err) => {
      logger.error(`Failed to start ${cli} process for task ${taskId}:`, { err });
    });
    p.on("exit", (code, signal) => {
      logger.info(`process for task ${taskId} exited with code ${code} and signal ${signal}`);
    });
    return p
  })()

  await sflow(
    [""], // Initial Prompt to start the agent, could be empty
  )
    .merge(
      // append messages from taskInputFlow
      sflow(taskInputFlow.readable)
        // send original message and then write '\n' after 1s delay to simulate user press Enter
        .map(async (awaitableText) => await awaitableText),
    )
    .by(fromStdio(p))
    // convert buffer to string
    .map(async (buffer) => buffer.toString())

    // pipe to /botWorkingDir/.logs/bot-<date>.log to claude input
    .forkTo(async (e) => {
      const logDate = new Date().toISOString().split("T")[0];
      await mkdir(path.resolve(`${botWorkingDir}/.logs`), { recursive: true });
      await e.forEach(async chunk => await appendFile(`${botWorkingDir}/.logs/bot-${logDate}.log`, chunk))
    })
    // show loading icon when any output activity, and remove the loading icon after idle for 5s
    .by((e) => {
      const idleWaiter = new IdleWaiter();
      let isThinking = false;
      return e.forEach(async (chunk) => {
        idleWaiter.ping();
        if (!isThinking) {
          isThinking = true;
          await slack.reactions.add({ name: "loading", channel: quickRespondMsg.channel, timestamp: quickRespondMsg.ts! }).catch(() => { });
          idleWaiter.wait(5000).finally(async () => {
            // clearInterval(id);
            await slack.reactions.remove({ name: "loading", channel: quickRespondMsg.channel, timestamp: quickRespondMsg.ts! }).catch(() => { });
            isThinking = false;
          });
        }
        return chunk;
      });
    })

    // Render terminal text to plain text and show live updates in slack
    .forkTo(async e => {
      const tr = new TerminalTextRender()
      let sent = ''
      let lastOutputs = [] // keep 3 last outputs to detect stability

      // logger.info('Rendered chunk size:', rendered.length, 'lines: ', rendered.split(/\r|\n/).length);
      const id = setInterval(async () => {
        const renderedText = tr.render();
        // diff from last, and send stable lines
        const common = commonPrefix(renderedText, ...lastOutputs);
        const newStable = renderedText.slice(0, common.length);
        // logger.debug({ common, newStable, lastOutputs, renderedText });

        if (newStable !== sent) {
          const news = newStable.slice(sent.length);
          sent = newStable;// agent outputs have new lines to send
          if (news)
            logger.debug(JSON.stringify({ news }));
          logger.info(`New stable output detected, length: ${sent.length}, news length: ${news.length}`);
          logger.info('Unsent preview:', { preview: news.slice(0, 200) });

          // send update to slack          
          const updateText = sent || "_(no output yet)_";

          const updateResponseResp = (await zChatCompletion(({
            updated_response: z.string(),
          }))`
TASK: Update my my_original_response based on agent's my_internal_thoughts findings, and give me updated_response to post in slack.

RULES:
- Do not remove any parts from my_original_response that are not mentioned in my_internal_thoughts.
- Preserve markdown formatting in my_original_response.
- If my_internal_thoughts contains new information, append it to the relevant sections in my_original_response.
- If my_internal_thoughts indicates completion of a task, add a "Tasks" section at the end of my_original_response with - [x] mark.
- Ensure updated_response is clear and concise.
- Use **bold** to highlight any new sections or important updates. and remove previeous highlighted sections if not important anymore.
If all infomations from my_internal_thoughts are already contained in my_original_response, you can feel free to return {updated_response: "__NOTHING_CHANGED__"}


IMPORTANT: KEEP message very short and informative, use url links to reference documents/repos instead of pasting large contents.
IMPORTANT: Focus on end-user's question or intent's helpful contents
DO NOT INCLUDE ANY internal-only or debugging contexts, system info, local paths, etc IN updated_response.
IMPORTANT: my_internal_thoughts may contain terminal control characters and environment system info, ignore them and only focus on the end-user-helpful content. 
IMPORTANT: YOU CAN ONLY change/remove/add up to 1 line!
IMPORTANT: Describe what you are currently doing in only 1 line! Dont show any ERRORs to user, if there are errors in tools, just record them to ERRORS.md and try to workaround by your self.
IMPORTANT: DONT ASK ME ANY QUESTIONS IN YOUR RESPONSE. JUST FIND NECESSARY INFORMATION BY YOUR SELF AND SHOW YOUR BEST UNDERSTANDING.
MOST IMPORTANT: Keep the my_original_response's context and formatting and contents as much as possible, only update a few lines that need to be updated based on my_internal_thoughts.
LENGTH LIMIT: updated_response must be within 4000 characters. SYSTEM WILL TRUNCATE IF EXCEEDING THIS LIMIT.

Task Contexts in YAML:

${yaml.stringify({
            my_internal_thoughts: tr.render().split('\n').slice(-40).join('\n'),
            news: news,
            user_original_intent: resp.user_intent,
            my_original_response: quickRespondMsg.markdown_text || '',
          })}
`)
          const updated_response_full = updateResponseResp.updated_response.trim().replace(/^__NOTHING_CHANGED__$/m, quickRespondMsg.markdown_text || '')
          // truncate to 4000 chars, from the middle, replace to '...TRUNCATED...'
          const updated_response = updated_response_full.length > 4000
            ? updated_response_full.slice(0, 2000) + '\n\n...TRUNCATED...\n\n' + updated_response_full.slice(-2000)
            : updated_response_full;

          await slack.chat.update({
            channel: event.channel,
            ts: quickRespondMsg.ts!,
            markdown_text: updated_response,
          });
          // update quickRespondMsg content
          quickRespondMsg.markdown_text = updated_response;
          await State.set(`task-quick-respond-msg-${taskId}`, { ts: quickRespondMsg.ts!, text: quickRespondMsg.markdown_text });
        }

        lastOutputs.push(renderedText);
        if (lastOutputs.length > 3) {
          lastOutputs.shift();
        }
      }, 1e3);

      await e.forEach(async chunk => {
        const rendered = tr.write(chunk)
      })
        .onFlush(() => clearInterval(id))
        .run()
    })

    // show contents in console
    // .forkTo((e) => e.pipeTo(fromWritable(process.stdout)))
    .forkTo((e) => e.pipeTo(fromWritable(process.stdout)))
    .run();

  TaskInputFlows.delete(taskId);
  // claude exited as no more inputs/outputs for a while, update the status message
  await slack.reactions.remove({ name: "thinking_face", channel: event.channel, timestamp: event.ts }).catch(() => { });
  await slack.reactions.add({ name: "white_check_mark", channel: event.channel, timestamp: event.ts }).catch(() => { });
  await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "done" });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSlackMessageFromUrl(url: string) {
  const { ts, channel } = slackMessageUrlParse(url)
  const page = await slack.conversations.history({ channel, limit: 1, inclusive: true, latest: ts })
  return page.messages?.[0] || DIE('not found')
}

function commonPrefix(...args: string[]): string {
  if (args.length === 0) return '';
  let prefix = args[0];
  for (let i = 1; i < args.length; i++) {
    let j = 0;
    while (j < prefix.length && j < args[i].length && prefix[j] === args[i][j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (prefix === '') break;
  }
  return prefix;
}
function sanitized(name: string) {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
}