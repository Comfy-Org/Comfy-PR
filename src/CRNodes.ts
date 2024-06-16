import type { ObjectId } from "mongodb";
import { filter, groupBy, values } from "rambda";
import YAML from "yaml";
import { type SlackMsg } from "./SlackMsgs";
import { db } from "./db";
import { fetchCRNodes } from "./fetchComfyRegistryNodes";
import { notifySlack } from "./notifySlack";

export type CRNode = Awaited<ReturnType<typeof fetchCRNodes>>[number] & {
  sent?: { slack?: SlackMsg };
  repo_id?: ObjectId;
};
export const CRNodes = db.collection<CRNode>("CRNodes");
await CRNodes.createIndex({ id: 1 }, { unique: true });
await CRNodes.createIndex({ repository: 1 }, { unique: false }); // WARN: duplicate is allowed
if (import.meta.main) {
  console.log(await updateCRNodes());
  console.log("CRNodes updated");
}
export async function updateCRNodes() {
  const nodes = await fetchCRNodes();

  // check src duplicated
  const group = groupBy((e) => e.repository, nodes);
  const duplicates = filter((e) => e.length > 1, group);
  if (values(duplicates).length) {
    const msg =
      "[WARN] Same repo but different ids found in comfyregistry:\n" + "```\n" + YAML.stringify(duplicates) + "\n```";
    await notifySlack(msg, { unique: true });
  }
  return await CRNodes.bulkWrite(
    nodes.flatMap((node) => ({
      updateOne: {
        filter: { id: node.id },
        update: { $set: node },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}
