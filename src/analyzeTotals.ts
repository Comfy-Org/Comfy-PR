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
