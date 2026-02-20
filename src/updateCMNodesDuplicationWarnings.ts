import pMap from "p-map";
import { filter, groupBy, map, prop, toPairs } from "rambda";
import YAML from "yaml";
import { CMNodes, type CMNode } from "./CMNodes";
import { notifySlack } from "@/lib/slack/notifySlack";

export async function updateCMNodesDuplicationWarnings(nodes: CMNode[]) {
  console.log("CMNodes checking duplicates");
  const idGroups = groupBy((e) => e.id, nodes);
  const titleGroups = groupBy((e) => e.title, nodes);
  const referenceGroups = groupBy((e) => e.reference, nodes);
  // prettier-ignore
  const dups = {
    ID: filter((e?: CMNode[]) => (e?.length??0) > 1, idGroups),
    TITLE: filter((e?: CMNode[]) => (e?.length??0) > 1, titleGroups),
    REFERENCE: filter((e?: CMNode[]) => (e?.length??0) > 1, referenceGroups),
  };
  const dupsSummary = JSON.stringify(map((x) => map((x) => x?.length ?? 0, x), dups));
  await notifySlack(
    `[WARN] CMNodes duplicates: ${dupsSummary}\nSolve them in https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json`,
  );

  await pMap(
    toPairs(dups),
    async ([topic, nodes]) =>
      await pMap(
        toPairs(nodes),
        async ([key, nodesRaw]) => {
          const nodes = nodesRaw?.map((nodeRaw) => {
            const { hash: _hash, ...node } = { ...nodeRaw };
            return node;
          });
          const hashes = nodesRaw?.map(prop("hash"));
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
        { concurrency: 2 },
      ),
    { concurrency: 2 },
  );
}
