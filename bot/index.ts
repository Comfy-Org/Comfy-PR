#!/usr/bin/env bun --watch
import { slack } from "@/lib";
import { db } from "@/src/db";
import { yaml } from "@/src/utils/yaml";
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
import zChatCompletion from "z-chat-completion";
import z from "zod";
import { IdleWaiter } from "./IdleWaiter";
import { parseSlackMessageToMarkdown } from "./slack/parseSlackMessageToMarkdown";
import { slackTsToISO } from "./slack/slackTsToISO";

const State = new Keyv(
  KeyvNest(
    new Map(),
    new KeyvNedbStore("./.cache/ComfyPRBotState.nedb.yaml"),
    new KeyvMongodbStore(db.collection("ComfyPRBotState")),
  ),
  { namespace: "", serialize: undefined, deserialize: undefined },
);

const TaskInputFlows = new Map<string, TransformStream<string, string>>();

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

if (import.meta.main) {
  console.log(`[${new Date().toISOString()}] Starting ComfyPR Bot...`);

  // console.log((await nedbstore.db.findAsync({})));
  // // Keep the process alive
  // // The event loop will continue running due to:
  // // 1. The periodic interval timer
  // // 2. The webhook server (if enabled)
  // // 3. The database connection pool
  // slack.
  // https://docs.slack.dev/reference/methods/apps.connections.open
  const { url } = await new Slack.WebClient(
    process.env.SLACK_SOCKET_TOKEN || DIE("missing env.SLACK_SOCKET_TOKEN"),
  ).apps.connections.open();
  // console.log(url)
  const ws = new WebSocket(url || DIE("No URL returned from Slack API"));
  ws.onmessage = async ({ data }) => {
    const parsed = JSON.parse(data);

    // Handle different Slack WebSocket message types
    let handled = false;

    // 1. Handle "hello" message (connection 1wledgment)
    if (parsed.type === "hello") {
      console.log(
        "[Slack WebSocket] Connection acknowledged:",
        JSON.stringify({
          connections: parsed.num_connections,
          host: parsed.debug_info?.host,
        }),
      );
      handled = true;
    }

    // 2. Handle "disconnect" message
    if (parsed.type === "disconnect") {
      console.log("[Slack WebSocket] Disconnect message:", JSON.stringify(parsed.reason));
      handled = true;
    }

    // 3. Handle "events_api" messages with app_mention events
    if (parsed.type === "events_api" && parsed.payload?.event) {
      const result = await zAppMentionEvent
        .parseAsync(parsed.payload.event)
        .then(async (event) => {
          await processSlackAppMentionEvent(event);
          return true;
        })
        .catch((err) => {
          // Log parse errors for debugging
          console.log("[Slack Event Parse Error]", JSON.stringify(err.message));
          return false;
        });
      handled = result;
    }

    // Log unhandled messages
    if (!handled) {
      console.log("MSG_NOT_MATCHED: " + JSON.stringify(data));
    }
  };
  ws.onerror = (event) => {
    console.error("WebSocket error observed:", event);
    throw new Error("Slack WebSocket error, exiting.");
  };
  ws.onopen = () => {
    console.log("Slack connection established.");
  };
  console.log(`[${new Date().toISOString()}] ComfyPR Bot is running.`);
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
  // msg dedup
  const eventProcessed = await State.get(`msg-event-${event.event_ts}`);
  if (eventProcessed?.touchedAt) {
    if (+new Date() - eventProcessed.touchedAt < 60000) return; // dedup for 1min
  }
  await State.set(`msg-event-${event.event_ts}`, { touchedAt: +new Date(), content: event.text });

  // whitelist channel name #comfypr-bot, for security reason, only runs agent against @mention messages in #comfypr-bot channel
  // you can forward other channel messages to #comfypr-bot if needed, and the bot will read the context from the original thread messages
  const channelInfo = await slack.conversations.info({ channel: event.channel });
  const channelName = channelInfo.channel?.name || DIE("failed to get channel info");
  const isAgentChannel = channelName === "comfypr-bot" || channelName === "pr-bot";

  // task state
  const taskId = event.thread_ts || event.ts;
  const task = await State.get(`task-${taskId}`);

  // Allow append messages to running task
  const existedTaskInputFlow = TaskInputFlows.get(taskId);
  if (existedTaskInputFlow) {
    // while agent still running, user sent new message in the same thread very quickly
    // lets understand the user's intent and give a quick response, and then append the msg to the existing agent input flow
    const threadMessages = await pageFlow(undefined as undefined | string, async (cursor, limit = 100) => {
      const resp = await slack.conversations.replies({
        channel: event.channel,
        ts: taskId,
        cursor,
        limit,
      });
      return {
        data: resp.messages || [],
        next: resp.response_metadata?.next_cursor,
      };
    })
      .flat()
      .map(async (m) => ({
        ts: slackTsToISO(m.ts || DIE("missing ts")),
        username: await slack.users
          .info({ user: m.user || DIE("missing user id in message") })
          .then((res) => res.user?.name || "<@" + m.user + ">"),
        markdown: await parseSlackMessageToMarkdown(m.text || ""),
      }))
      .toArray();

    // use LLM to understand the new message intent
    const action = await zChatCompletion(
      z.object({
        user_intent: z.string(),
        my_quick_respond: z.string(),
        stop_existing_task: z.boolean(),
        msg_to_append_to_agent: z.string().optional(),
      }),
      {
        model: "gpt-4o",
      },
    )`
The user sent a new message in a Slack thread where I am already assisting them with an ongoing task. The new message is as follows:
${event.text}

The thread's recent messages are:j
${yaml.stringify(
  threadMessages.toSorted(compareBy((e) => +(e.ts || 0))), // sort by ts asc
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
- msg_to_append_to_agent: The content of the new message to append to the existing task's input flow, if applicable.
`;
    console.log("New message intent analysis:", action);

    // send quick response
    const myQuickRespondMsg = await slack.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: action.my_quick_respond,
    });
    if (action.stop_existing_task) {
      // stop existing task
      TaskInputFlows.delete(taskId);
      await slack.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        text: `The existing task has been stopped as per your request.`,
      });
      await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "stopped_by_user" });
      return "existing task stopped by user";
    }
    if (action.msg_to_append_to_agent) {
      const w = existedTaskInputFlow.writable.getWriter();
      await w.write(
        `New message from <@${event.user}> in the thread:\n${event.text}\n\nMy quick response to the user: ${action.my_quick_respond}\n\n`,
      );
      w.releaseLock();
      console.log(`Appended new message to existing task ${taskId} input flow.`);
      return "msg appended to existing task";
    }
    return;
  }

  const taskInputFlow = new TransformStream<string, string>();
  if (isAgentChannel) {
    TaskInputFlows.set(taskId, taskInputFlow);
  }

  // fetch full context from the thread using slack api

  // 1. fetch contexts from nearby messages (in the thread or channel)
  // 2. use quick LLM to determine intent.
  // 3. spawn agent if needed.

  // For now, just reply with a greeting.

  // await slack.chat.postMessage({
  //     channel: event.channel,
  //     text: replyText,
  //     thread_ts: event.ts,
  // });

  // mark that msg as seeing
  await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "checking" });
  await slack.reactions.add({ name: "eyes", channel: event.channel, timestamp: event.ts }).catch(() => {});

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
        text: m.text,
        ts: m.ts,
      }))
      .toArray()
  ).toSorted(compareBy((e) => +(e.ts || 0))); // sort by ts asc

  // quick-intent-detect-respond by chatgpt, give quick plan/context responds before start heavy agent work
  const resp = await zChatCompletion(
    z.object({
      user_intent: z.string(),
      my_respond_before_spawn_agent: z.string(),
      // spawn_agent: z.boolean(),
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
- https://github.com/Comfy-Org/ComfyUI_frontend: The frontend codebase for ComfyUI, built with Vue and TypeScript.
- https://github.com/Comfy-Org/docs: Documentation for ComfyUI, including setup guides, tutorials, and API references.
- https://github.com/Comfy-Org/desktop: The desktop application for ComfyUI, providing a user-friendly interface and additional functionalities.
- https://github.com/Comfy-Org/registry: The registry.comfy.org, where users can share and discover ComfyUI custom-nodes, and extensions.
- https://github.com/Comfy-Org/workflow_templates: A collection of official shared workflow templates for ComfyUI to help users get started quickly.

- https://github.com/Comfy-Org/comfy-api: A RESTful API service for comfy-registry, it stores custom-node metadatas and user profile/billings informations.

- And also other repos under Comfy-Org organization on GitHub.

Respond in JSON format with the following fields:
- user_intent: A brief description of the user's intent. e.g. "The user is asking for help with setting up a CI/CD pipeline."
- my_respond_before_spawn_agent: A short message I can send to the user right away. e.g. "Got it, let me look into that for you."
`;
  // - spawn_agent?: true or false, indicating whether an agent is needed to handle this request. e.g. if the user is asking for complex tasks like searching the web, managing repositories, or interacting with other services, or need to check original thread, set this to true.
  console.log("Intent detection response:", resp);

  const quickRespondMsg = await slack.chat.postMessage({
    channel: event.channel,
    thread_ts: event.ts,
    text: resp.my_respond_before_spawn_agent,
  });

  // spawn agent if needed & allowed
  // if (!resp.spawn_agent) {
  //     // update status
  //     await slack.reactions.remove({ name: 'eyes', channel: event.channel, timestamp: event.ts, });
  //     await slack.reactions.add({ name: 'white_check_mark', channel: event.channel, timestamp: event.ts, });
  //     await State.set(`task-${taskId}`, { ...await State.get(`task-${taskId}`), status: 'done' });
  //     return 'no agent spawned'
  // }

  // The problem not easy to solve in original thread, lets forward this message to #pr-bot channel, and then spawn agent using that message.
  if (!isAgentChannel) {
    // update status, remove eye, add forwarding reaction
    await slack.reactions.remove({ name: "eyes", channel: event.channel, timestamp: event.ts });
    await slack.reactions.add({ name: "arrow_right", channel: event.channel, timestamp: event.ts });

    const originalMessageUrl = `https://${event.team}.slack.com/archives/${event.channel}/p${event.ts.replace(".", "")}`;
    // forward msg to #pr-bot channel, mention original msg user:content, and the original msg url for agent to read
    const agentChannelId =
      (await slack.conversations.list({ types: "public_channel" })).channels?.find((c) => c.name === "pr-bot")?.id ||
      DIE("failed to find #pr-bot channel id");
    // this is a user facing msg to tell user we are forwarding the msg
    const text = `Forwarded message from <@${event.user}> in <#${event.channel}>:\n${await parseSlackMessageToMarkdown(event.text)}\n\nYou can view the original message here: ${originalMessageUrl}`;
    const forwardedMsg = await slack.chat.postMessage({
      channel: agentChannelId,
      text,
    });

    // mention forwarded msg in original thread says I will continue there
    await slack.chat.update({
      channel: event.channel,
      ts: quickRespondMsg.ts!,
      text: `${resp.my_respond_before_spawn_agent}\n\nI have forwarded your message to <#${agentChannelId}>. I will continue the research there.`,
    });
    await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "forward_to_pr_bot_channel" });

    // process the forwarded message in agent channel
    return await processSlackAppMentionEvent({
      ...event,
      channel: agentChannelId,
      ts: forwardedMsg.ts!,
      thread_ts: undefined,
      text: forwardedMsg.text || "",
    });
  }

  await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "thinking" });
  await slack.reactions.remove({ name: "eyes", channel: event.channel, timestamp: event.ts });

  await slack.reactions.add({ name: "thinking_face", channel: event.channel, timestamp: event.ts });
  // await slack.reactions.add({ name: 'thinking_face', channel: event.channel, timestamp: statusMsg.ts, });
  const agentPrompt = `
You are @ComfyPR-Bot, act on behalf @snomiao of Comfy-Org, an AI assistant integrated into Slack, Notion, Github.
A user mentioned you with the following message:

${JSON.stringify(await parseSlackMessageToMarkdown(event.text))}

You have already determined the user's intent as follows:
${resp.user_intent}

Your preliminary response to the user is:
${JSON.stringify(resp.my_respond_before_spawn_agent)}

Now, based on the user's intent, please do research and provide a detailed and helpful response to assist the user with their request.

Possible Context Repos:
- https://github.com/comfyanonymous/ComfyUI: The main ComfyUI repository containing the core application logic and features. Its a python backend to run any machine learning models and solves various machine learning tasks.
- https://github.com/Comfy-Org/ComfyUI_frontend: The frontend codebase for ComfyUI, built with Vue and TypeScript.
- https://github.com/Comfy-Org/docs: Documentation for ComfyUI, including setup guides, tutorials, and API references.
- https://github.com/Comfy-Org/desktop: The desktop application for ComfyUI, providing a user-friendly interface and additional functionalities.
- https://github.com/Comfy-Org/registry: The registry.comfy.org, where users can share and discover ComfyUI custom-nodes, and extensions.
- https://github.com/Comfy-Org/workflow_templates: A collection of official shared workflow templates for ComfyUI to help users get started quickly.
- https://github.com/Comfy-Org/comfy-api: A RESTful API service for comfy-registry, it stores custom-node metadatas and user profile/billings informations.

- And also other repos under Comfy-Org organization on GitHub.

## Respond Rules
- Use markdown format for all your responses.
- If you reference code, repos, or documents, provide links to them.
- Always prioritize user privacy and data security.
- Provide rich references and citations for your information.

## Skills you have:
- Search the web for relevant information.
- github: Clone any repositories from https://github.com/Comfy-Org to ./codes/Comfy-Org/[repo]/tree/[branch] to inspect codebases.
- slack: You should update your response frequently by run 'bun ../bot/slack/msg-update.ts --channel ${event.channel} --ts ${quickRespondMsg.ts!} --text "<your response here>"'
- slack: You should read threads in background for context if possible, run 'bun ../bot/slack/msg-read-thread.ts --channel ${event.channel} --ts [ts]'
- notion: Search Notion docs whenever possible from Comfy-Org team using ./bot/notion-search.ts
- Local file system: Your working directory are temp, make sure commit your work to external services like slack/github/notion where user can see it, before your ./ dir get cleaned up.
`;

  const taskUser = `bot-user-${taskId.replace(".", "-")}`;
  await mkdir(`/home/${taskUser}`, { recursive: true });
  // todo: create a linux user for task

  // todo: spawn in a worker user
  // create a user for task
  await sflow(
    "", // Can send later message from this thread
  )
    .merge(
      sflow(taskInputFlow.readable)
        // send original message and then write '\n' after 1s delay to simulate user press Enter
        .flatMap((msg) => [msg, sleep(1000).then(() => "\n")])
        .map(async (awaitableText) => await awaitableText),
    )
    .by(fromStdio(spawn("claude-yes", ["--prompt", agentPrompt], { cwd: `/home/${taskUser}` })))
    // show loading icon when any output activity, and remove the loading icon after idle for 5s
    .by((e) => {
      const idleWaiter = new IdleWaiter();
      let isThinking = false;
      return e.forEach(async (chunk) => {
        idleWaiter.ping();
        if (!isThinking) {
          isThinking = true;
          await slack.reactions.add({ name: "thinking_face", channel: event.channel, timestamp: event.ts });
          idleWaiter.wait(5000).then(async () => {
            // clearInterval(id);
            await slack.reactions.remove({ name: "thinking_face", channel: event.channel, timestamp: event.ts });
            isThinking = false;
          });
        }
        return chunk;
      });
    })
    // prints to stdout
    // .by(e => {
    //     const tr = new TerminalTextRender()
    //     const liveLines: {
    //         text: string, // content of this line
    //         t: number // timestamp of this line that got updated, we can safely show it to user when its stable for a while, e.g. 5s
    //     }[] = []
    //     let linesCheckpoint = 0 // last lines index that got sent to user
    //     const id = setInterval(async () => {
    //         console.log('Live lines: ', liveLines.length, (liveLines).map(l => l.t).join('|'))
    //         const now = Date.now()
    //         let newLines = false
    //         let renderedText = ''
    //         liveLines.forEach((line, idx) => {
    //             if (now - line.t > 3000) { // stable for 3s
    //                 renderedText += line.text + '\n'
    //                 if (idx >= linesCheckpoint) {
    //                     newLines = true
    //                 }
    //             }
    //         })
    //         linesCheckpoint = liveLines.length
    //     }, 1000)

    //     return e.forEach(chunk => {
    //         const rendered = tr.write(chunk).render();
    //         console.log('Rendered chunk size:', rendered.length, 'lines: ', rendered.split(/\r|\n/).length);
    //         rendered.split(/\r|\n/)
    //             .forEach((lineText, idx) => {
    //                 liveLines[idx] ??= { text: '', t: 0 }
    //                 if (liveLines[idx].text !== lineText) {
    //                     liveLines[idx].text = lineText
    //                     liveLines[idx].t = Date.now()
    //                 }
    //             })
    //     }).onFlush(() => clearInterval(id))
    // })

    // show contents in console
    .forkTo((e) => e.pipeTo(fromWritable(process.stdout)))
    .run();

  TaskInputFlows.delete(taskId);
  // claude exited as no more inputs/outputs for a while, update the status message
  await slack.reactions.remove({ name: "thinking_face", channel: event.channel, timestamp: event.ts });
  await slack.reactions.add({ name: "white_check_mark", channel: event.channel, timestamp: event.ts });
  await State.set(`task-${taskId}`, { ...(await State.get(`task-${taskId}`)), status: "done" });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
