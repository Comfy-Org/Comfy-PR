import DIE from "@snomiao/die";
import pMap from "p-map";
import { match } from "ts-pattern";
import { $OK, TaskError, TaskOK } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos } from "./CNRepos";
import { $flatten, $stale } from "./db";
import { matchRelatedPulls } from "./matchRelatedPulls";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  await tLog("updateCNReposRelatedPulls", updateCNReposRelatedPulls);
}
export async function updateCNReposRelatedPulls() {
  await CNRepos.createIndex({ "pulls.state": 1, "crPulls.mtime": 1 });
  return await pMap(
    CNRepos.find($flatten({ pulls: { state: "ok" }, crPulls: { mtime: $stale("1d") } })),
    async (repo, _i) => {
      const { repository } = repo;
      const pulls = match(repo.pulls)
        .with($OK, (e) => e.data)
        .otherwise(() => DIE("Pulls not found"));
      const crPulls = await matchRelatedPulls(pulls).then(TaskOK).catch(TaskError);
      return await CNRepos.updateOne({ repository }, { $set: { crPulls } });
    },
  );
}
