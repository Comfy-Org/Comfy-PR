import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { peekYaml } from "peek-log";
import { filter, groupBy, values } from "rambda";
import YAML from "yaml";
import { TaskOK } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos } from "./CNRepos";
import { CRNodes } from "./CRNodes";
import { fetchCRNodes } from "./fetchComfyRegistryNodes";
import { notifySlack } from "./slack/notifySlack";
import { tLog } from "./utils/tLog";

if (import.meta.main) {
  peekYaml(await tLog(updateCRNodes));
  console.log("CRNodes updated");

  peekYaml(
    await $pipeline(CNRepos).project({ repository: 1, on_registry: 1 }).sample({ size: 8 }).aggregate().toArray(),
  );
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

  return [
    await $pipeline(CNRepos)
      .project({ repository: 1 })
      .set({ on_registry: TaskOK({ $in: ["$repository", nodes.map(({ repository }) => repository).filter(Boolean)] }) })
      .merge({ into: "CNRepos", on: "repository", whenMatched: "merge", whenNotMatched: "insert" })
      .aggregate()
      .next(),
    await CRNodes.bulkWrite(
      nodes.map((node) => ({
        updateOne: {
          filter: { id: node.id },
          update: { $set: node },
          upsert: true,
        },
      })),
      { ordered: false },
    ),
  ];
}
