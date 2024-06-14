import DIE from "@snomiao/die";
import pMap from "p-map";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { $OK, TaskError, TaskOK } from "./Task";
import { $fresh } from "./db";
import { $stale } from "./db";
import { $flatten } from "./db/$flatten";
import { matchRelatedPulls } from "./fetchRelatedPulls";
if (import.meta.main) {
  const result = await updateCNReposRelatedPulls();
  console.log(result.length + " CNRepos updated");
}
export async function updateCNReposRelatedPulls() {
  return await pMap(
    CNRepos.find(
      $flatten({
        pulls: { mtime: $fresh("7d"), data: { $exists: true } },
        crPulls: { mtime: $stale("3d") },
      }),
    ),
    async (repo, i) => {
      const { repository } = repo;
      const pulls = match(repo.pulls)
        .with($OK, (e) => e.data)
        .otherwise(() => DIE("Pulls not found"));
      const crPulls = await matchRelatedPulls(pulls)
        .then(TaskOK)
        .catch(TaskError);
      return await CNRepos.updateOne({ repository }, { $set: { crPulls } });
    },
  );
}
