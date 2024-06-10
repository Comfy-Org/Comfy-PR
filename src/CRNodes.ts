import { fetchComfyRegistryNodes } from "./fetchComfyRegistryNodes";
import { filter, groupBy, values } from "rambda";
import { YAML } from "zx";
import { db } from "./db";
import pMap from "p-map";
import { slackNotify, type SlackNotification } from "./SlackNotifications";
import { slackLinksNotify } from "./slackUrlsNotify";

export type CRNode = Awaited<
  ReturnType<typeof fetchComfyRegistryNodes>
>[number] & {
  sent?: { slack?: SlackNotification };
};
export const CRNodes = db.collection<CRNode>("CRNodes");
await CRNodes.createIndex({ id: 1 }, { unique: true });
await CRNodes.createIndex({ repository: 1 }, { unique: false }); // WARN: duplicate is allowed
if (import.meta.main) {
  console.log(await updateCRNodes());
}
export async function updateCRNodes() {
  const nodes = await fetchComfyRegistryNodes();

  // check src duplicated
  const group = groupBy((e) => e.repository, nodes);
  const duplicates = filter((e) => e.length > 1, group);
  if (values(duplicates).length) {
    const msg =
      "[WARN] Same repo but different ids found in comfyregistry:\n" +
      "```\n" +
      YAML.stringify(duplicates) +
      "\n```";
    await slackNotify(msg, { unique: true });
  }
  // update or insert
  const result = await pMap(nodes, async (node) => {
    const r = await CRNodes.updateOne(
      { id: node.id },
      { $set: node },
      { upsert: true }
    );
    return { ...r, link: { name: node.name, href: node.repository } };
  });
  const modified = result.filter((e) => e.modifiedCount).map((e) => e.link);
  const upserted = result.filter((e) => e.upsertedCount).map((e) => e.link);
  await slackLinksNotify("ComfyRegistry Nodes updated", modified);
  await slackLinksNotify("ComfyRegistry Nodes added", upserted);
  return result;
}
