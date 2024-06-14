import pMap from "p-map";
import { timingLogWith } from "timing-with";
import { CNRepos } from "./CNRepos";
import { TaskError, TaskOK } from "./Task";
import { $stale } from "./db";
import { $flatten } from "./db/$flatten";
import { fetchGithubPulls } from "./fetchGithubPulls";
if (import.meta.main) {
  console.log(await timingLogWith("Update CNRepos for Github Pulls", updateCNReposPulls));
}
export async function updateCNReposPulls() {
  return await pMap(
    CNRepos.find($flatten({ pulls: { mtime: $stale("1d") } })),
    async ({ repository }) => {
      const pulls = await fetchGithubPulls(repository)
        .then(TaskOK)
        .catch(TaskError);
      // match(pulls).with($OK, ({ data }) =>
      //   console.debug(`[DEBUG] ${data.length} Pulls for ${repository}`),
      // ).otherwise(() => {});
      return await CNRepos.updateOne({ repository }, { $set: { pulls } });
    },
    { concurrency: 1 },
  );
}
