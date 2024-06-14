import { unary } from "lodash-es";
import pMap from "p-map";
import { dissoc, filter, groupBy, map, prop, toPairs } from "rambda";
import { YAML } from "zx";
import { CMNodes, type CMNode } from "./CMNodes";
import { notifySlack } from "./notifySlack";

export async function updateCMNodesDuplicationWarnings(nodes: CMNode[]) {
  console.log("CMNodes checking duplicates");
  // prettier-ignore
  const dups = {
    ID: filter((e: typeof nodes) => e.length > 1, groupBy((e) => e.id, nodes)),
    TITLE: filter((e: typeof nodes) => e.length > 1, groupBy((e) => e.title, nodes)),
    REFERENCE: filter((e: typeof nodes) => e.length > 1, groupBy((e) => e.reference, nodes)),
  };
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
