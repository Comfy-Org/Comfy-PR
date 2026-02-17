import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { sflow } from "sflow";
import { Authors } from "./Authors";
import { CNRepos } from "./CNRepos";
import { $flatten } from "./db";

/** Update authors for gh users, collecting emails/username/hireable */
export async function updateAuthorsFromCNRepo() {
  return await sflow(
    $pipeline(CNRepos)
      .match($flatten({ info: { data: { owner: { login: { $exists: true } } } } }))
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
      .set({ githubId: "$_id" })
      .project({ _id: 0 })
      .aggregate(),
  )
    .map((doc) => {
      const { githubId, ...$set } = doc as Record<string, unknown>;
      return Authors.updateOne(
        { githubId: githubId as string | undefined },
        { $set: $set as Record<string, unknown> } as Parameters<typeof Authors.updateOne>[1],
        { upsert: true },
      );
    })
    .done();
}
