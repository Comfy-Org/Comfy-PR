import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import promiseAllProperties from "promise-all-properties";
import YAML from "yaml";
import { CMNodes } from "./CMNodes";
import { CNRepos } from "./CNRepos";
import { tLog } from "./utils/tLog";

if (import.meta.main) {
  await tLog("analyzeTotals", async () => {
    console.log(YAML.stringify(await analyzeTotals()));
    return [];
  });
}
export async function analyzeTotals() {
  "use server";
  const totals = await promiseAllProperties({
    "Total Nodes on UI-Manager": CMNodes.estimatedDocumentCount(),
    "Total PRs Made": $pipeline<any>(CNRepos)
      .unwind("$crPulls.data")
      .stage({ $group: { _id: "$crPulls.data.type", total: { $sum: 1 } } })
      .stage({ $sort: { _id: 1 } })
      .stage({ $set: { id_total: [["$_id", "$total"]] } })
      .stage({ $group: { _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } } })
      .aggregate()
      .map((e: any) => e.pairs)
      .next(),
    "Total Repos": $pipeline<any>(CNRepos)
      // .match({ "info.data": { $exists: true } })
      .stage({
        $group: {
          _id: null,
          "on Comfy Manager List": { $sum: { $cond: [{ $eq: [{ $type: "$cm" }, "missing"] }, 0, 1] } },
          "on Registry": { $sum: { $cond: [{ $eq: [{ $type: "$cr" }, "missing"] }, 0, 1] } },
          Archived: { $sum: { $cond: ["$info.data.archived", 1, 0] } },
          All: { $sum: 1 },
          Candidates: { $sum: { $cond: [ "$candidate.data", 1, 0] } },
          "Got ERROR on creating PR": { $sum: { $cond: [{$eq: ["$createdPulls.state", 'error']}, 1, 0] } },
        },
      })
      // .stage({ $sort: { _id: 1 } })
      // .stage({ $set: { id_total: [[{ $toString: "$_id" }, "$archived"]] } })
      // .stage({ $group: { _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } } })
      .project({ _id: 0 })
      .aggregate()
      // .map((e: any) => e.pairs)
      .next(),
    "Total Open": $pipeline<any>(CNRepos)
      .unwind("$crPulls.data")
      .match({ "crPulls.data.pull.prState": "open" })
      .stage({ $group: { _id: "$crPulls.data.type", total: { $sum: 1 } } })
      .stage({ $sort: { _id: 1 } })
      .stage({ $set: { id_total: [["$_id", "$total"]] } })
      .stage({ $group: { _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } } })
      .aggregate()
      .map((e: any) => e.pairs)
      .next(),
    "Total Merged (on Registry)": $pipeline<any>(CNRepos)
      .unwind("$crPulls.data")
      .match({ cr: { $exists: true }, "crPulls.data.pull.prState": "merged" })
      .stage({ $group: { _id: "$crPulls.data.type", total: { $sum: 1 } } })
      .stage({ $sort: { _id: 1 } })
      .stage({ $set: { id_total: [["$_id", "$total"]] } })
      .stage({ $group: { _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } } })
      .aggregate()
      .map((e: any) => e.pairs)
      .next(),
    "Total Merged (not on Registry)": $pipeline<any>(CNRepos)
      .unwind("$crPulls.data")
      .match({ cr: { $exists: false }, "crPulls.data.pull.prState": "merged" })
      .stage({ $group: { _id: "$crPulls.data.type", total: { $sum: 1 } } })
      .stage({ $sort: { _id: 1 } })
      .stage({ $set: { id_total: [["$_id", "$total"]] } })
      .stage({ $group: { _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } } })
      .aggregate()
      .map((e: any) => e.pairs)
      .next(),
    "Total Closed": $pipeline<any>(CNRepos)
      .unwind("$crPulls.data")
      .match({ "crPulls.data.pull.prState": "closed" })
      .stage({ $group: { _id: "$crPulls.data.type", total: { $sum: 1 } } })
      .stage({ $sort: { _id: 1 } })
      .stage({ $set: { id_total: [["$_id", "$total"]] } })
      .stage({ $group: { _id: null, pairs: { $mergeObjects: { $arrayToObject: "$id_total" } } } })
      .aggregate()
      .map((e: any) => e.pairs)
      .next(),
  });
  return totals;
}
