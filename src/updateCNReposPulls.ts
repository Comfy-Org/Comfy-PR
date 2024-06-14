import pMap from "p-map";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { $OK, TaskError, TaskOK } from "./Task";
import { $stale } from "./db";
import { $flatten } from "./db/$flatten";
import { fetchGithubPulls } from "./fetchGithubPulls";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  console.log(await tLog("Update CNRepos for Github Pulls", updateCNReposPulls));
}
export async function updateCNReposPulls() {
  return await pMap(
    CNRepos.find($flatten({ pulls: { mtime: $stale("1d") } })),
    async ({ repository }) => {
      const pulls = await fetchGithubPulls(repository).then(TaskOK).catch(TaskError);
      match(pulls)
        .with($OK, ({ data }) => console.debug(`[DEBUG] updated ${data.length} Pulls from ${repository}`))
        .otherwise(() => {});
      return await CNRepos.updateOne({ repository }, { $set: { pulls } });
    },
    { concurrency: 1 },
  );
}
