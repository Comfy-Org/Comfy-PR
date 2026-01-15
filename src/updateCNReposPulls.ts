import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import sflow from "sflow";
import { match } from "ts-pattern";
import { $OK, TaskError, TaskOK } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos } from "./CNRepos";
import { $flatten, $stale } from "./db";
import { fetchGithubPulls } from "@/lib/github/fetchGithubPulls";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  console.log(await tLog("Update CNRepos for Github Pulls", updateCNReposPulls));
}
export async function updateCNReposPulls() {
  await CNRepos.createIndex("pulls.mtime");
  return await sflow(
    $pipeline(CNRepos)
      .match($flatten({ pulls: { mtime: $stale("1d") } }))
      .project({ repository: 1 })
      .aggregate(),
  )
    .pMap(
      async ({ repository }) => {
        const pulls = await fetchGithubPulls(repository).then(TaskOK).catch(TaskError);
        match(pulls)
          .with($OK, ({ data }) =>
            console.debug(`[DEBUG] fetched ${data.length} Pulls from ${repository}`),
          )
          .otherwise(() => {});
        return await CNRepos.updateOne({ repository }, { $set: { pulls } });
      },
      { concurrency: 2 },
    )
    .toArray();
}
