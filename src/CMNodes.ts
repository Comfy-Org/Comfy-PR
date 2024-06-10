import pMap from "p-map";
import { db } from "./db";
import { fetchComfyUIManagerNodeList } from "./fetchComfyUIManagerNodeList";
import { slackLinksNotify } from "./slackUrlsNotify";
import { filter, groupBy, prop, values } from "rambda";
import { YAML } from "zx";

export type CMNode = Awaited<
  ReturnType<typeof fetchComfyUIManagerNodeList>
>[number];
export const CMNodes = db.collection<CMNode>("CMNodes");
await CMNodes.createIndex({ reference: 1 }, { unique: true });
await CMNodes.createIndex({ title: 1 }, { unique: true });
// await CMNodes.createIndex({ id: 1 }, { unique: true }); // bad thing is: id is not unique

if (import.meta.main) {
  console.log(await updateCMNodes());
}
export async function updateCMNodes() {
  const nodes = await fetchComfyUIManagerNodeList();

  // assert title is no duplicated
  const grouped = groupBy((e) => e.title, nodes);
  const duplicates = filter(
    (e) => e.length > 1,
    grouped
  );
  if (values(duplicates).length) {
    throw new Error("Duplicated nodes found: " + YAML.stringify(duplicates));
  }
  const result = await pMap(nodes, async (node) => ({
    ...(await CMNodes.updateOne(
      { reference: node.reference },
      { $set: node },
      { upsert: true }
    )),
    link: {
      name:
        node.reference.replace(/^https?:\/\/(?:github.com\/)?/, "") +
        " - " +
        node.title,
      href: node.reference,
    },
  }));
  const upserted = result.filter((e) => e.upsertedCount).map((e) => e.link);
  const modified = result.filter((e) => e.modifiedCount).map((e) => e.link);
  await slackLinksNotify("Custom Nodes updated", modified);
  await slackLinksNotify("Custom Nodes added", upserted);
  return result;
}
