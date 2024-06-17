import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import pMap from "p-map";
import { peekYaml } from "peek-log";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { $stale } from "./db";
import { $flatten } from "./db/$flatten";
import { fetchGithubPulls } from "./fetchGithubPulls";
import { $OK, TaskError, TaskOK } from "./utils/Task";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  console.log(await tLog("Update CNRepos for Github Pulls", updateCNReposPulls));
}
export async function updateCNReposPulls() {
  await CNRepos.createIndex("pulls.mtime");
  return await pMap(
    $pipeline(CNRepos)
      .match(peekYaml($flatten({ pulls: { mtime: $stale("1d") } })))
      .project({ repository: 1 })
      .aggregate(),
    async ({ repository }) => {
      const pulls = await fetchGithubPulls(repository).then(TaskOK).catch(TaskError);
      match(pulls)
        .with($OK, ({ data }) => console.debug(`[DEBUG] updated ${data.length} Pulls from ${repository}`))
        .otherwise(() => {});
      return await CNRepos.updateOne({ repository }, { $set: { pulls } });
    },
    { concurrency: 2 },
  );
}
