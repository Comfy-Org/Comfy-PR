import pMap from "p-map";
import { match } from "ts-pattern";
import { $flatten } from "./db/$flatten";
import { createComfyRegistryPullRequests } from "./createComfyRegistryPullRequests";
import { $ERROR, $OK, TaskError, TaskOK } from "./utils/Task";
import { $fresh } from "./db";
import { $stale } from "./db";
import { parseUrlRepoOwner, stringifyOwnerRepo } from "./parseOwnerRepo";
import { notifySlackLinks } from "./notifySlackLinks";
import { CNRepos } from "./CNRepos";

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
      })
    ),
    async (repo) => {
      const { repository } = repo;
      console.log("Making PRs for " + repository);
      const createdPulls = await createComfyRegistryPullRequests(repository)
        .then(TaskOK)
        .catch(TaskError);
      match(createdPulls).with($OK, async ({ data }) => {
        const links = data.map((e) => ({
          href: e.html_url,
          name: stringifyOwnerRepo(
            parseUrlRepoOwner(e.html_url.replace(/\/pull\/.*$/, ""))
          ) +
            " #" +
            e.title,
        }));
        await notifySlackLinks("PR just Created, @HaoHao check plz", links);
      });

      return await CNRepos.updateOne(
        { repository },
        { $set: $flatten({ createdPulls }) }
      );
    },
    { concurrency: 1 }
  );
}
