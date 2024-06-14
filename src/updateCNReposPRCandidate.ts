import pMap from "p-map";
import { match } from "ts-pattern";
import { YAML } from "zx";
import { CNRepos } from "./CNRepos";
import { $fresh, $stale } from "./db";
import { $flatten } from "./db/$flatten";
import { $OK, TaskOK } from "./utils/Task";
if (import.meta.main) {
  console.log(await updateCNReposPRCandidate());
  // show candidates
  console.log(
    YAML.stringify(
      await CNRepos.find($flatten({ candidate: { data: { $eq: true } } }))
        .map((e) => ({
          // candidate: match(e.candidate)
          //   .with($OK, (e) => e)
          //   .otherwise(() => DIE("")).data,
          repo: e.repository + "/pulls?q=",
        }))
        .toArray(),
    ),
  );
}

export async function updateCNReposPRCandidate() {
  return await pMap(
    CNRepos.find(
      $flatten({
        crPulls: { mtime: $fresh("1d"), ...$OK },
        info: { mtime: $fresh("7d"), ...$OK, data: { private: false, archived: false } },
        candidate: { mtime: $stale("7d") },
      }),
    ),
    async (repo) => {
      const crPulls = match(repo.crPulls)
        .with($OK, (e) => e.data)
        .otherwise(() => null)!;
      const info = match(repo.info)
        .with($OK, (e) => e.data)
        .otherwise(() => null)!;

      const isCandidate = !info.private && !info.archived && crPulls.length === 0;
      const candidate = TaskOK(isCandidate);

      // silent
      // if (isCandidate)
      //   await notifySlackLinks("Found new PR candidate", [repo.repository]);
      await CNRepos.updateOne({ repository: repo.repository }, { $set: { candidate } });
      return repo;
    },
  );
}
