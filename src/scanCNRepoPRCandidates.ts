import DIE from "@snomiao/die";
import pMap from "p-map";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { $OK, TaskOK } from "./Task";
import { $flatten, $fresh, $stale } from "./db";
import { slackLinksNotify } from "./slackUrlsNotify";
if (import.meta.main) {
  console.log(await updateCNRepoPRCandidates());
  console.log(
    await CNRepos.find({ candidate: { $exists: true } })
      .map((e) => ({
        candidate: match(e.candidate)
          .with($OK, (e) => e)
          .otherwise(() => DIE("")).data,
        repo: e.repository,
      }))
      .toArray(),
  );
}

export async function updateCNRepoPRCandidates() {
  return await pMap(
    CNRepos.find(
      $flatten({
        crPulls: { mtime: $fresh("1d"), ...$OK },
        info: { mtime: $fresh("7d"), ...$OK },
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

      const isCandidate =
        !info.private && !info.archived && crPulls.length === 0;
      const candidate = TaskOK(isCandidate);
      if (isCandidate)
        await slackLinksNotify("Found PR candidate", [repo.repository]);
      await CNRepos.updateOne(
        { repository: repo.repository },
        { $set: { candidate } },
      );
      return repo;
    },
  );
}
