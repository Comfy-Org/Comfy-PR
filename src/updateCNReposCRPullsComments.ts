import pMap from "p-map";
import { peekYaml } from "peek-log";
import { CNRepos, type CRPull } from "./CNRepos";
import { $fresh, $stale } from "./db";
// import { $flatten } from "./db/$flatten";
// import { $pipeline } from "./db/$pipeline";
import { $flatten } from "@/packages/mongodb-pipeline-ts/$flatten";
import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { getWorkerInstance } from "./WorkerInstances";
import { fetchIssueComments } from "./fetchPullComments";
import { TaskError, TaskOK } from "./utils/Task";

if (import.meta.main) {
  await getWorkerInstance("updateCNReposCRPullsComments");
  await updateCNReposCRPullsComments();
  console.log("All done");
}

export async function updateCNReposCRPullsComments() {
  return await pMap(
    $pipeline<any>(CNRepos)
      .unwind("$crPulls.data")
      .match($flatten({ crPulls: { mtime: $fresh("7d"), data: { comments: { mtime: $stale("1d") } } } }))
      .set($flatten({ "crPulls.data": { repository: "$repository" } }))
      .replaceRoot({ newRoot: "$crPulls.data" })
      .aggregate(),
    async (data) => {
      const { repository, pull } = data as unknown as { repository: string } & CRPull;
      const html_url = pull.html_url;
      const comments = await fetchIssueComments(repository, pull).then(TaskOK).catch(TaskError);
      return peekYaml([
        await CNRepos.findOneAndUpdate(
          $flatten({ repository, crPulls: { data: { pull: { html_url } } } }),
          { $set: { "crPulls.data.$.comments": comments } },
          { upsert: true, returnDocument: "after" },
        ),
      ]);
    },
    { concurrency: 1 },
  );
}
