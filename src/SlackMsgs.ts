import type { ObjectId } from "mongodb";
import { updateSlackMessages } from "./updateSlackMessages";
import { db } from "./db";
import { slack } from "./slack";
import { postSlackMessage } from "./postSlackMessage";

export const SlackMsgs = db.collection<SlackMsg>("SlackMsgs6");
await SlackMsgs.createIndex({ ts: -1 });
await SlackMsgs.createIndex({ channel: 1, ts: -1 });
await SlackMsgs.createIndex({ text: 1 });
await SlackMsgs.createIndex({ mtime: -1 });
export type SlackMsg = (Awaited<ReturnType<typeof postSlackMessage>> | {}) & {
  text: string;
  last_id?: ObjectId;
  unique?: boolean;
  silent?: boolean;
  status?: "sent" | "sending" | "error" | "pending last";
  error?: string;
};

export type SlackNotifyOptions = {
  unique?: boolean;
  last?: ObjectId;
  silent?: boolean;
};

// try send msgs that didn't send in last run
updateSlackMessages();

if (import.meta.main) {
  await slack.api.test({});
}
