import pMap from "p-map";
import { CNRepos } from "./CNRepos";
import { $stale } from "./db";
import { $flatten } from "./db/$flatten";
import { gh } from "./gh";
import { parseUrlRepoOwner } from "./parseOwnerRepo";
import { TaskError, TaskOK } from "./utils/Task";

if (import.meta.main) {
  console.log(await updateCNReposInfo());
  console.log("scanCNRepoInfo DONE");
}
export async function updateCNReposInfo() {
  return await pMap(
    CNRepos.find($flatten({ info: { mtime: $stale("1d") } })),
    async ({ repository }) => {
      const info = await gh.repos
        .get({ ...parseUrlRepoOwner(repository) })
        .then(({ data }) => data)
        .then(TaskOK)
        .catch(TaskError);
      return await CNRepos.updateOne({ repository }, { $set: { info: info } }, { upsert: true });
    },
    { concurrency: 1 },
  );
}
