import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import pMap from "p-map";
import { peekYaml } from "peek-log";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { $fresh, $stale } from "./db";
import { $flatten } from "./db/$flatten";
import { updateCNReposPulls } from "./updateCNReposPulls";
import { updateCNReposRelatedPulls } from "./updateCNReposRelatedPulls";
import { $OK, TaskOK } from "./utils/Task";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  console.log(await updateCNReposPRCandidate());
  // show candidates
  // console.log(
  //   YAML.stringify(
  //     await CNRepos.find($flatten({ candidate: { data: { $eq: true } } }))
  //       .map((e) => ({
  //         // candidate: match(e.candidate)
  //         //   .with($OK, (e) => e)
  //         //   .otherwise(() => DIE("")).data,
  //         repo: e.repository + "/pulls?q=",
  //       }))
  //       .toArray(),
  //   ),
  // );
  tLog("updateCNReposPulls", updateCNReposPulls);
  tLog("updateCNReposRelatedPulls", updateCNReposRelatedPulls);

  await CNRepos.createIndex("crPulls.mtime");
  // show candidates
  peekYaml(
    await $pipeline(CNRepos)
      .match(
        peekYaml(
          $flatten({
            crPulls: { mtime: $stale("7d") },
            // info: { mtime: $fresh("7d"), data: { private: false, archived: false } },
            // createdPulls: { mtime: $stale("7d"), data: { $exists: false } },
          }),
        ),
      )
      .aggregate()
      .map((e) => ({ repo: e.repository + "/pulls?q=", pulls: e.pulls?.length, crPulls: e.crPulls?.length }))
      .toArray(),
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
