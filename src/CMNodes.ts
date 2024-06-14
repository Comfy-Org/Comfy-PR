import jsonStableStringify from "json-stable-stringify";
import { unary } from "lodash-es";
import md5 from "md5";
import type { ObjectId } from "mongodb";
import pMap from "p-map";
import { dissoc, filter, groupBy, map, prop, toPairs } from "rambda";
import { YAML } from "zx";
import { type SlackMsg } from "./SlackMsgs";
import { db } from "./db";
import { fetchCMNodes } from "./fetchCMNodes";
import { notifySlack } from "./notifySlack";

// Raw version maybe duplicated with id or reference
type CMNodeRaw = Awaited<ReturnType<typeof fetchCMNodesWithHash>>[number];
export type CMNode = CMNodeRaw & {
  repo_id?: ObjectId;
  duplicated?: {
    [k: string]: { hashes: string[]; slackNotification: SlackMsg };
  };
};
export const CMNodes = db.collection<CMNode>("CMNodes3");
await CMNodes.createIndex({ mtime: -1 });
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
  console.log("CMNodes updating (" + nodes.length + " nodes)");

  // updating nodes
  await CMNodes.bulkWrite(
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

  console.log("CMNodes checking duplicates");
  // prettier-ignore
  const dups = {
    ID: filter((e: typeof nodes) => e.length > 1, groupBy((e) => e.id, nodes)),
    TITLE: filter((e: typeof nodes) => e.length > 1, groupBy((e) => e.title, nodes)),
    REFERENCE: filter((e: typeof nodes) => e.length > 1, groupBy((e) => e.reference, nodes)),
  }
  const dupsSummary = JSON.stringify(map((x) => map((x) => x.length, x), dups));
  await notifySlack(
    `[WARN] CMNodes duplicates: ${dupsSummary}\nSolve them in https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json`,
  );

  await pMap(
    toPairs(dups),
    async ([topic, nodes]) =>
      await pMap(
        toPairs(nodes),
        async ([key, nodesRaw]) => {
          const nodes = nodesRaw.map(unary(dissoc("hash")));
          const hashes = nodesRaw.map(prop("hash"));
          // check sent
          const someDuplicateSent = await CMNodes.findOne({
            hash: { $in: hashes },
            [`duplicated.${topic}`]: { $exists: true },
          });
          if (someDuplicateSent) return;
          // send slack notification
          const slackNotification = await notifySlack(
            `[ACTION NEEDED WARNING]: please resolve duplicated node in ${topic}: ${key}\n` +
              "```\n" +
              YAML.stringify(nodes) +
              "```" +
              "\n\nSolve them in https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json",
            { unique: true },
          );
          // mark duplicates
          await CMNodes.updateMany(
            { hash: { $in: hashes } },
            {
              $set: { [`duplicated.${topic}`]: { hashes, slackNotification } },
            },
          );
        },
        { concurrency: 1 },
      ),
    { concurrency: 1 },
  );
}

async function fetchCMNodesWithHash() {
  return (await fetchCMNodes()).map((e) => ({
    ...e,
    hash: md5("SALT=Bvxmh8mGYh6qzLGE " + jsonStableStringify(e)),
  }));
}
