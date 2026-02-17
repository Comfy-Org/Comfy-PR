import type { ObjectId } from "mongodb";
import { db } from "@/src/db";
import { postSlackMessage } from "@/src/postSlackMessage";
export const SlackMsgs = db.collection<SlackMsg>("SlackMsgs");
await SlackMsgs.createIndex({ ts: -1 });
await SlackMsgs.createIndex({ channel: 1, ts: -1 });
await SlackMsgs.createIndex({ text: 1 });
await SlackMsgs.createIndex({ mtime: -1 });
// Performance optimization: compound index for status + mtime queries
// This index dramatically improves queries filtering by status with mtime range
// Target query: { $or: [{ status: { $exists: false } }, { status: { $in: [...] }, mtime: ... }] }
await SlackMsgs.createIndex({ status: 1, mtime: 1 });

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
