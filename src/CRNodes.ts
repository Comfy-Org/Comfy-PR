import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import type { ObjectId } from "mongodb";
import { peekYaml } from "peek-log";
import { sf } from "sflow";
import { CNRepos } from "./CNRepos";
import { db } from "./db";
import { fetchCRNodes } from "./fetchComfyRegistryNodes";
import { type SlackMsg } from "@/lib/slack/SlackMsgs";

export type CRNode = Awaited<ReturnType<typeof fetchCRNodes>>[number] & {
  sent?: { slack?: SlackMsg };
  repo_id?: ObjectId;
};
export const CRNodes = db.collection<CRNode>("CRNodes");
await CRNodes.createIndex({ id: 1 }, { unique: true });
await CRNodes.createIndex({ repository: 1 }, { unique: false }); // WARN: duplicate is allowed

if (import.meta.main) {
  // peek cr nodes
  const r = await sf
    .sflow(
      $pipeline(CNRepos)
        .match({ cr: { $exists: true } })
        .replaceRoot({ newRoot: "$cr" })
        .aggregate(),
    )
    .toArray();
  peekYaml({ r, len: r.length });
}
