import pMap from "p-map";
import { match } from "ts-pattern";
import { user } from ".";
import { CNRepos } from "./CNRepos";
import { $OK } from "./Task";
import { $flatten } from "./db/$flatten";
if (import.meta.main) {
  await updateOutdatedPullsTemplates();
}
export async function updateOutdatedPullsTemplates() {
  const templateOutdate = new Date("2024-06-13T09:02:56.630Z");
  return await pMap(
    CNRepos.find($flatten({ crPulls: { data: { $exists: true } } })),
    async (repo) => {
      console.log(repo.repository);
      const crPulls = match(repo.crPulls)
        .with($OK, (e) => e.data)
        .otherwise(() => null)!;
      await pMap(crPulls, async ({ pull, type }) => {
        const { repository } = repo;
        const { number } = pull;
        if (+new Date(pull.updated_at) < +templateOutdate) {
          if (pull.user.login === user.login) {
            console.log(
              `Found Outdated PR comment body: ${repository}/pull/${number}`,
            );
            // await gh.issues.updateComment({
            //   owner: "Comfy",
            //   repo: "Comfy",
            //   comment_id: number,
            //   body: `# Outdated PR
            //   This PR is outdated, please refer to the latest PRs for the latest changes.`
            // })
          }
        }
      });
      // update outdated pr issue bodies
      return crPulls;
    },
  );
}
