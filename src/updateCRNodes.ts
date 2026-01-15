import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { peekYaml } from "peek-log";
import { filter, groupBy, values } from "rambda";
import YAML from "yaml";
import { TaskOK } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos } from "./CNRepos";
import { UNCLAIMED_ADMIN_PUBLISHER_ID } from "./constants";
import { CRNodes } from "./CRNodes";
import { fetchCRNodes } from "./fetchComfyRegistryNodes";
import { notifySlack } from "@/lib/slack/notifySlack";
import { tLog } from "./utils/tLog";

if (import.meta.main) {
  peekYaml(await tLog(updateCRNodes));
  console.log("CRNodes updated");

  peekYaml(
    await $pipeline(CNRepos)
      .project({ repository: 1, on_registry: 1 })
      .sample({ size: 8 })
      .aggregate()
      .toArray(),
  );
}
export async function updateCRNodes() {
  const nodes = await fetchCRNodes();

  // check src duplicated
  const group = groupBy((e) => e.repository, nodes);
  const duplicates = filter((e) => (e?.length ?? 0) > 1, group);
  if (values(duplicates).length) {
    const msg =
      "[WARN] Same repo but different ids found in comfyregistry:\n" +
      "```\n" +
      YAML.stringify(duplicates) +
      "\n```";
    await notifySlack(msg, { unique: true });
  }

  const CRNodesRepo = nodes.map(({ repository }) => repository).filter(Boolean);
  const CRNodesRepoExcludeUnclaimed = nodes
    .filter((e) => e.publisher.id !== UNCLAIMED_ADMIN_PUBLISHER_ID)
    .map(({ repository }) => repository)
    .filter(Boolean);
  return [
    await $pipeline(CNRepos)
      .project({ repository: 1 })
      .match({
        repository: { $exists: true, $ne: null, $type: "string" },
      })
      .set({
        on_registry_all: TaskOK({ $in: ["$repository", CRNodesRepo] }),
        on_registry: TaskOK({ $in: ["$repository", CRNodesRepoExcludeUnclaimed] }),
      })
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
