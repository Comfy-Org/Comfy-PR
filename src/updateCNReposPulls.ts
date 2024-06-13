import pMap from "p-map";
import { timingWith } from "timing-with";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { slackNotify } from "./SlackNotifications";
import { $ERROR, $OK, TaskError, TaskOK } from "./Task";
import { $flatten, $stale } from "./db";
import { fetchGithubPulls } from "./fetchGithubPulls";
if (import.meta.main) {
  await timingWith("Update CNRepos for Github Pulls", updateCNReposPulls);
}
export async function updateCNReposPulls() {
  return await pMap(
    CNRepos.find($flatten({ pulls: { mtime: $stale("1d") } })),
    async ({ repository }) => {
      const pulls = await fetchGithubPulls(repository)
        .then(TaskOK)
        .catch(TaskError);
      await match(pulls)
        .with($OK, ({ data }) =>
          console.log(`[INFO] ${data.length} Pulls for ${repository}`),
        )
        .with($ERROR, ({ error }) =>
          slackNotify(
            `[WARN] Fetching Pulls error: ${error} for ${repository}`,
          ),
        )
        .exhaustive();
      return await CNRepos.updateOne({ repository }, { $set: { pulls } });
    },
    { concurrency: 1 },
  );
}
