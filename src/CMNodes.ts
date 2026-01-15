import jsonStableStringify from "json-stable-stringify";
import md5 from "md5";
import type { ObjectId } from "mongodb";
import { db } from "./db";
import { fetchCMNodes } from "./fetchCMNodes";
import { type SlackMsg } from "@/lib/slack/SlackMsgs";
import { updateCMNodesDuplicationWarnings } from "./updateCMNodesDuplicationWarnings";

// Raw version maybe duplicated with id or reference
type CMNodeRaw = Awaited<ReturnType<typeof fetchCMNodesWithHash>>[number];
export type CMNode = CMNodeRaw & {
  repo_id?: ObjectId;
  duplicated?: {
    [k: string]: { hashes: string[]; slackNotification: SlackMsg };
  };
};
export const CMNodes = db.collection<CMNode>("CMNodes");
await CMNodes.createIndex({ mtime: -1 }).catch(() => {});
await CMNodes.createIndex({ hash: 1 }, { unique: true }).catch(() => {});

if (import.meta.main) {
  console.time("CMNodes");
  console.log(await updateCMNodes());
  // check dups
  console.timeLog("CMNodes");
  const all = await CMNodes.countDocuments({});
  console.timeLog("CMNodes");
  const dups = await CMNodes.countDocuments({ duplicated: { $exists: true } });
  console.timeEnd("CMNodes");
  console.log("CMNodes updated, duplicates:", dups, "all:", all);
}
export async function updateCMNodes() {
  const nodes = await fetchCMNodesWithHash();
  console.log(`CMNodes updating (${nodes.length} nodes)`);

  // updating nodes
  const updateResult = await CMNodes.bulkWrite(
    nodes.flatMap((node) => ({
      updateOne: {
        filter: { hash: node.hash },
        update: { $set: node },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  // delete outdated
  // await CMNodes.deleteMany({ hash: { $nin: nodes.map(prop("hash")) } });

  await updateCMNodesDuplicationWarnings(nodes);

  return [updateResult];
}

async function fetchCMNodesWithHash() {
  return (await fetchCMNodes()).map((e) => ({
    ...e,
    hash: md5("SALT=Bvxmh8mGYh6qzLGE " + jsonStableStringify(e)),
  }));
}
