import DIE from "@snomiao/die";
import { $fresh, db } from "./db";
import { slack } from "./slack";
import type { ObjectId } from "mongodb";
import { slackMessagePost } from "./slackMessagePost";
import pMap from "p-map";
export type SlackMsg = (Awaited<ReturnType<typeof slackMessagePost>> | {}) & {
  text: string;
  last_id?: ObjectId;
  unique?: boolean;
  status?: "sent" | "sending" | "error" | "pending last";
  error?: string;
};
export const SlackMsgs = db.collection<SlackMsg>("SlackMsgs");
await SlackMsgs.createIndex({ ts: -1 });
await SlackMsgs.createIndex({ channel: 1, ts: -1 });
await SlackMsgs.createIndex({ text: 1 });
await SlackMsgs.createIndex({ mtime: -1 });

if (import.meta.main) {
  await slack.api.test({});
  const text =
    "# Hello world\n\ntest rich message at " + new Date().toISOString();
  console.log(await slackNotify(text));
}

export async function slackNotify(
  text: string,
  {
    unique = true,
    last,
    silent,
  }: { unique?: boolean; last?: ObjectId; silent?: boolean } = {}
) {
  const limit = 3000; // slack message limit is 3001
  if (text.length > limit) {
    const lines = text.split("\n");
    const lineLimit = lines.findIndex((_, i) => {
      const text = lines.slice(0, i + 1).join("\n");
      return text.length > limit;
    });

    const head = lines.slice(0, lineLimit).join("\n");
    const remains = lines.slice(lineLimit).join("\n");
    const sent = await slackNotify(head, { unique });
    return await slackNotify(remains, { unique, last: sent._id });
  }
  if (unique) {
    const existed = await SlackMsgs.findOne({ text });
    if (existed) return existed;
  }
  // add task
  const { insertedId: _id } = await SlackMsgs.insertOne({
    text,
    ...(unique && { unique }),
    ...(last && { last_id: last }),
  });
  console.info(text);

  slackNotifyTask().then(() => console.info("slack notify task done"));
  return { _id };
}

export async function slackNotifyTask() {
  // max 20 msg per 30s
  while (20 < (await SlackMsgs.countDocuments({ mtime: $fresh("30s") })))
    await new Promise((r) => setTimeout(r, 1000));
  // send
  return await pMap(
    SlackMsgs.find({ error: { $exists: false }, ts: { $exists: false } }),
    async ({ _id, text, last_id: last }) => {
      if (last) {
        // check if last succ
        const lastSent = await SlackMsgs.findOne({ _id: last });
        if (lastSent?.status !== "sent") {
          await SlackMsgs.updateOne(
            { _id },
            { $set: { status: "pending last" } }
          );
          return;
        }
      }
      await SlackMsgs.updateOne({ _id }, { $set: { error: "sending..." } });
      const sent = await slackMessagePost(text)
        .then((e) => ({ ...e, error: undefined, status: "sent" as const }))
        .catch((e) => ({
          error: e.message ?? String(e),
          status: "error" as const,
        }));
      await SlackMsgs.updateOne(
        { _id },
        { $set: { ...sent, mtime: new Date() } }
      );
    },
    { concurrency: 1 }
  );
}
