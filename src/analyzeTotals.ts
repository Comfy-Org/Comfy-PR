"use server";
import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import promiseAllProperties from "promise-all-properties";
import YAML from "yaml";
import { CMNodes } from "./CMNodes";
import { CNRepos } from "./CNRepos";
import { UNCLAIMED_ADMIN_PUBLISHER_ID } from "./constants";
import { CRNodes } from "./CRNodes";
import { $flatten } from "./db";
import { tLog } from "./utils/tLog";

if (import.meta.main) {
  await tLog("analyzeTotals", async () => {
    console.log(YAML.stringify(await analyzeTotals()));
    return [];
  });
}
/**
 * @warning this function is heavy, TODO: split into small chunk
 */
export async function analyzeTotals() {
  "use server";
  const totals = await promiseAllProperties({
    // Now: new Date().toISOString(),
    "Total Nodes": promiseAllProperties({
      "on ComfyUI Manager": CMNodes.estimatedDocumentCount(),
      "on Registry": CRNodes.estimatedDocumentCount(),
      "on Registry (exclude unclaimed)": CRNodes.countDocuments({
        "publisher.id": { $ne: UNCLAIMED_ADMIN_PUBLISHER_ID },
      } as Record<string, unknown>),
    }),
    "Total Repos": $pipeline(CNRepos)
      .group({
        _id: null,
        "on Comfy Manager List": {
          $sum: { $cond: [{ $eq: [{ $type: "$cm" }, "missing"] }, 0, 1] },
        },
        "on Registry": { $sum: { $cond: [{ $eq: [{ $type: "$cr" }, "missing"] }, 0, 1] } },
        Archived: { $sum: { $cond: ["$info.data.archived", 1, 0] } },
        All: { $sum: 1 },
        // Candidates: { $sum: { $cond: ["$candidate.data", 1, 0] } },
        "Got ERROR on creating PR": {
          $sum: { $cond: [{ $eq: ["$createdPulls.state", "error"] }, 1, 0] },
        },
      })
      .project({ _id: 0 })
      .aggregate()
      // .map((e: unknown) => e.pairs)
      .next(),
    "Total Authors": $pipeline(CNRepos)
      .match($flatten({ info: { data: { owner: { login: { $exists: true } } } } }))
      .group({
        _id: "$info.data.owner.login",
        // author: "$info.data.owner.login",
        cm: { $sum: { $cond: [{ $eq: [{ $type: "$cm" }, "missing"] }, 0, 1] } },
        cr: { $sum: { $cond: [{ $eq: [{ $type: "$cr" }, "missing"] }, 0, 1] } },
        All: { $sum: 1 },
      })
      .set({ author: "$_id" })
      .group({
        _id: null,
        "on Comfy Manager List": { $sum: { $cond: [{ $eq: ["$cm", 0] }, 0, 1] } },
        "on Registry": { $sum: { $cond: [{ $eq: ["$cr", 0] }, 0, 1] } },
        All: { $sum: 1 },
      })
      .project({ _id: 0 })
      .aggregate()
      // .map((e: unknown) => e.pairs)
      .next(),
    "Total PRs Made": $pipeline(CNRepos)
      .unwind("$crPulls.data")
      .group({ _id: "$crPulls.data.type", total: { $sum: 1 } })
      .sort({ _id: 1 })
      .set({ id_total: [["$_id", "$total"]] })
      .group({ _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } })
      .aggregate()
      .map((e: unknown) => e.pairs)
      .next(),
    "Total Open": $pipeline(CNRepos)
      .unwind("$crPulls.data")
      .match({ "crPulls.data.pull.prState": "open" })
      .group({ _id: "$crPulls.data.type", total: { $sum: 1 } })
      .sort({ _id: 1 })
      .set({ id_total: [["$_id", "$total"]] })
      .group({ _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } })
      .aggregate()
      .map((e: unknown) => e.pairs)
      .next(),
    "Total Merged (on Registry)": $pipeline(CNRepos)
      .unwind("$crPulls.data")
      .match({ cr: { $exists: true }, "crPulls.data.pull.prState": "merged" })
      .group({ _id: "$crPulls.data.type", total: { $sum: 1 } })
      .sort({ _id: 1 })
      .set({ id_total: [["$_id", "$total"]] })
      .group({ _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } })
      .aggregate()
      .map((e: unknown) => e.pairs)
      .next(),
    "Total Merged (not on Registry)": $pipeline(CNRepos)
      .unwind("$crPulls.data")
      .match({ cr: { $exists: false }, "crPulls.data.pull.prState": "merged" })
      .group({ _id: "$crPulls.data.type", total: { $sum: 1 } })
      .sort({ _id: 1 })
      .set({ id_total: [["$_id", "$total"]] })
      .group({ _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } })
      .aggregate()
      .map((e: unknown) => e.pairs)
      .next(),
    "Total Closed": $pipeline(CNRepos)
      .unwind("$crPulls.data")
      .match({ "crPulls.data.pull.prState": "closed" })
      .group({ _id: "$crPulls.data.type", total: { $sum: 1 } })
      .sort({ _id: 1 })
      .set({ id_total: [["$_id", "$total"]] })
      .group({ _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } })
      .aggregate()
      .map((e: unknown) => e.pairs)
      .next(),

    // // Follow Rules
    // "Follow Up Rules": (async function () {
    //   return TaskDataOrNull(await showFollowRuleSet({ name: "default" }));
    // })(),
  });
  return totals;
}
