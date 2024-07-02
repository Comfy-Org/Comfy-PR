import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { snoflow } from "snoflow";
import { Authors } from "./Authors";
import { CNRepos } from "./CNRepos";
import { $filaten } from "./db";

/** Update authors for gh users, collecting emails/username/hireable */
export async function updateAuthorsFromCNRepo() {
  return await snoflow(
    $pipeline(CNRepos)
      .match($filaten({ info: { data: { owner: { login: { $exists: true } } } } }))
      .group({
        _id: "$info.data.owner.login",
        // author: "$info.data.owner.login",
        cm: { $sum: { $cond: [{ $eq: [{ $type: "$cm" }, "missing"] }, 0, 1] } },
        cr: { $sum: { $cond: [{ $eq: [{ $type: "$cr" }, "missing"] }, 0, 1] } },

        // TODO: get totals open/closed/merged
        // pulls:{
        //   OPEN: {"$crPulls.data.pull.prState", "open"}
        // }
        All: { $sum: 1 },
      })
      .set({ login: "$_id" })
      .project({ _id: 0 })
      .aggregate()
  )
    .peek(({ login, ...$set }) => Authors.updateOne({ login }, { $set }, { upsert: true }))
    .done();
}
