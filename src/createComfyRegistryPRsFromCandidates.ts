import pMap from "p-map";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { createComfyRegistryPullRequests } from "./createComfyRegistryPullRequests";
import { $fresh, $stale } from "./db";
import { $flatten } from "./db/$flatten";
import { notifySlackLinks } from "./notifySlackLinks";
import { parseUrlRepoOwner, stringifyOwnerRepo } from "./parseOwnerRepo";
import { $ERROR, $OK, TaskError, TaskOK } from "./utils/Task";
if (import.meta.main) {
  // await createComfyRegistryPRsFromCandidates();
}
export async function createComfyRegistryPRsFromCandidates() {
  return await pMap(
    CNRepos.find(
      $flatten({
        candidate: { mtime: $fresh("1d"), ...$OK, data: { $eq: true } },
        $or: [
          // prs that never created
          { createdPulls: { $exists: false } },
          // retry pr erros after 5m
          { createdPulls: { ...$ERROR, mtime: $stale("5m") } },
        ],
      }),
    ),
    async (repo) => {
      const { repository } = repo;
      console.log("Making PRs for " + repository);
      const createdPulls = await createComfyRegistryPullRequests(repository).then(TaskOK).catch(TaskError);
      match(createdPulls).with($OK, async ({ data }) => {
        const links = data.map((e) => ({
          href: e.html_url,
          name: stringifyOwnerRepo(parseUrlRepoOwner(e.html_url.replace(/\/pull\/.*$/, ""))) + " #" + e.title,
        }));
        await notifySlackLinks("PR just Created, @HaoHao check plz", links);
        await pMap(data, async (pull) => {
          const { html_url } = pull;
          // also update to crPulls
          await CNRepos.updateOne($flatten({ repository, crPulls: { data: { pull: { html_url } } } }), {
            $set: { "crPulls.data.$.pull": pull },
          });
        });
      });

      return await CNRepos.updateOne({ repository }, { $set: { createdPulls } });
    },
    { concurrency: Number(process.env.createComfyRegistryPRsFromCandidate_concurrency || 5), stopOnError: false },
  );
}
