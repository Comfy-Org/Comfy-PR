import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { peekYaml } from "peek-log";
import { filter, groupBy, values } from "rambda";
import YAML from "yaml";
import { CNRepos } from "./CNRepos";
import { CRNodes } from "./CRNodes";
import { fetchCRNodes } from "./fetchComfyRegistryNodes";
import { notifySlack } from "./slack/notifySlack";
import { tLog } from "./utils/tLog";

if (import.meta.main) {
  peekYaml(await tLog(updateCRNodes));
  console.log("CRNodes updated");

  // peekYaml(await CNRepos.aggregate([{ $sample: { size: 2 } }]).toArray());
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
    // await CNRepos.bulkWrite(
    //   nodes.map(({ repository }) => ({
    //     updateOne: {
    //       filter: $filaten<CNRepo>({ repository }),
    //       update: { $set: { on_registry: TaskOK(true) } },
    //       upsert: true,
    //     },
    //   })),
    // ),
    await $pipeline(CNRepos)
      .project({
        repository: 1,
        on_registry: {
          state: "ok",
          mtime: new Date(),
          data: { $in: ["$repository", nodes.map(({ repository }) => repository).filter(Boolean)] },
        },
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
