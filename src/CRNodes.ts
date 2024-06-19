import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import type { ObjectId } from "mongodb";
import pMap from "p-map";
import { peekYaml } from "peek-log";
import { CNRepos } from "./CNRepos";
import { db } from "./db";
import { fetchCRNodes } from "./fetchComfyRegistryNodes";
import { type SlackMsg } from "./slack/SlackMsgs";

export type CRNode = Awaited<ReturnType<typeof fetchCRNodes>>[number] & {
  sent?: { slack?: SlackMsg };
  repo_id?: ObjectId;
};
export const CRNodes = db.collection<CRNode>("CRNodes");
await CRNodes.createIndex({ id: 1 }, { unique: true });
await CRNodes.createIndex({ repository: 1 }, { unique: false }); // WARN: duplicate is allowed
if (import.meta.main) {
  const r = await pMap(
    $pipeline(CNRepos)
      .match({ cr: { $exists: true } })
      .replaceRoot({ newRoot: "$cr" })
      .aggregate(),
    (e) => e,
  );
  peekYaml({ r, len: r.length });
}
