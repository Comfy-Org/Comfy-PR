/**
 * Shared state management for ComfyPR Bot
 * Exports SlackBotState for use across bot modules
 */

import { Keyv } from "keyv";
import KeyvMongodbStore from "keyv-mongodb-store";
import KeyvNedbStore from "keyv-nedb-store";
import KeyvNest from "keyv-nest";
import { db } from "@/src/db";

export const SlackBotState = new Keyv(
  KeyvNest(
    new Map(),
    new KeyvNedbStore("./.cache/ComfyPRBotState.jsonl"),
    new KeyvMongodbStore(db.collection("ComfyPRBotState")),
  ),
  { namespace: "", serialize: undefined, deserialize: undefined },
);
