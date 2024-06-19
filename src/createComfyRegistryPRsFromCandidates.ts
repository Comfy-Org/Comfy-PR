import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import pMap from "p-map";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { createComfyRegistryPullRequests } from "./createComfyRegistryPullRequests";
import { $filaten, $stale } from "./db";
import { parseUrlRepoOwner, stringifyOwnerRepo } from "./parseOwnerRepo";
import { notifySlackLinks } from "./slack/notifySlackLinks";
import { $OK, TaskError, TaskOK } from "./utils/Task";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  await tLog("createComfyRegistryPRsFromCandidates", createComfyRegistryPRsFromCandidates);
  console.log("all done");
}
export async function createComfyRegistryPRsFromCandidates() {
  await CNRepos.createIndex($filaten({ candidate: { data: 1 } }));
  await CNRepos.createIndex(
    $filaten({
      candidate: { data: 1 },
      createdPulls: { state: 1, mtime: 1 },
    }),
  );
  return await pMap(
    $pipeline(CNRepos)
      .match(
        
        $filaten({
          candidate: { data: { $eq: true } },
          createdPulls: { state: { $ne: "ok" }, mtime: $stale("5m") },
          
        }),
      )
      .aggregate(),
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
          await CNRepos.updateOne($filaten({ repository, crPulls: { data: { pull: { html_url } } } }), {
            $set: { "crPulls.data.$.pull": pull },
          });
        });
      });

      return await CNRepos.updateOne({ repository }, { $set: { createdPulls } });
    },
    { concurrency: 2, stopOnError: false },
  );
}
