import DIE from "@snomiao/die";
import { db } from "./db";
import { slack } from "./slack";

const channel =
  process.env.SLACK_BOT_CHANNEL || DIE("missing env.SLACK_BOT_CHANNEL");
export const SlackNotifications =
  db.collection<SlackNotification>("SlackNotifications");
await SlackNotifications.createIndex({ ts: -1 });
await SlackNotifications.createIndex({ channel: 1, ts: -1 }, { unique: true });
await SlackNotifications.createIndex({ text: 1 });

if (import.meta.main) {
  await slack.api.test({});
  const text =
    "# Hello world\n\ntest rich message at " + new Date().toISOString();
  // const nodes = await CNRepos.find({}).toArray();
  // console.log(nodes);
  console.log(await slackNotify(text));
}

export async function slackNotify(text: string, { unique = false } = {}) {
  const limit = 3000;
  if (text.length > limit) {
    const lines = text.split("\n");
    const lineLimit = lines.findIndex((_, i) => {
      const text = lines.slice(0, i + 1).join("\n");
      return text.length > limit;
    });

    const head = lines.slice(0, lineLimit).join("\n");
    const remains = lines.slice(lineLimit).join("\n");
    await slackNotify(head, { unique });
    return await slackNotify(remains, { unique });
  }
  if (unique) {
    const existed = await SlackNotifications.findOne({ text });
    if (existed) return existed;
  }
  
  console.info(text);
  const notification = await slackMessagePost(text);
  console.log({ notification });
  return (
    (
      await SlackNotifications.updateOne(
        { ts: notification.ts },
        { $set: notification },
        { upsert: true }
      )
    ).acknowledged ||
    DIE("failed to upsert SlackNotifications, message may send twice")
  );
}

export type SlackNotification = Awaited<ReturnType<typeof slackMessagePost>>;
async function slackMessagePost(text: string) {
  const response = await slack.chat.postMessage({
    channel,
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: text,
        },
      },
    ],
  });
  return { channel, ts: response.ts, text };
}

const _sampleResponse = {
  ok: true,
  channel: "C077358GZLM",
  ts: "1718010894.926909",
  message: {
    user: "U0778SAF1FE",
    type: "message",
    ts: "1718010894.926909",
    bot_id: "B07768ZCLRH",
    app_id: "A0776C8S48J",
    text: "# Hello world\n\ntest rich message at2024-06-10T09:14:54.796Z",
    team: "T0462DJ9G3C",
    bot_profile: {
      id: "B07768ZCLRH",
      app_id: "A0776C8S48J",
      name: "comfy-pr-notification",
      // icons: [Object ...],
      deleted: false,
      updated: 1717809775,
      team_id: "T0462DJ9G3C",
    },
    // blocks: [
    //   [Object ...]
    // ],
  },
  response_metadata: {
    scopes: [
      "app_mentions:read",
      "channels:history",
      "channels:join",
      "channels:manage",
      "channels:read",
      "chat:write.customize",
      "chat:write.public",
      "chat:write",
    ],
    acceptedScopes: ["chat:write"],
  },
};
