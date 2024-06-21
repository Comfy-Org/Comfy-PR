import { $elemMatch } from "@/packages/mongodb-pipeline-ts/$elemMatch";
import DIE from "@snomiao/die";
import pMap from "p-map";
import { match } from "ts-pattern";
import { $OK, TaskError, TaskOK, tsmatch } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos, type CRPull } from "./CNRepos";
import { $filaten, $fresh, $stale } from "./db";
import { gh } from "./gh";
import { parsePull } from "./gh/parsePull";
import { ghUser } from "./ghUser";
import { parseUrlRepoOwner } from "./parseOwnerRepo";
import { readTemplate } from "./readTemplateTitle";
import { notifySlackLinks } from "./slack/notifySlackLinks";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  await tLog("updateOutdatedPullsTemplates", updateOutdatedPullsTemplates);
}

export async function updateOutdatedPullsTemplates() {
  const pyproject = await readTemplate("add-toml.md");
  const publishcr = await readTemplate("add-action.md");
  const outdated_pyproject = await readTemplate("outdated/add-toml.md");
  const outdated_pyproject_v2 = await readTemplate("outdated/add-toml-v2.md");
  const outdated_publishcr = await readTemplate("outdated/add-action.md");
  // const templateOutdate = new Date("2024-06-13T09:02:56.630Z");

  await CNRepos.createIndex({
    "crPulls.mtime": -1,
    "crPulls.data.edited.error": -1,
    "crPulls.data.edited.mtime": -1,
    "crPulls.data.edited.state": -1,
    "crPulls.data.pull.body": -1,
    "crPulls.data.pull.title": -1,
    "crPulls.data.pull.user.login": -1,
  });
  return await pMap(
    CNRepos.find(
      $filaten({
        crPulls: {
          mtime: $fresh("1h"), // retry if update fails
          data: $elemMatch({
            edited: {
              mtime: $stale("30m"), // retry if update fails
              state: { $ne: "ok" },
              error: { $nin: ["up to date", "body mismatch"] },
            },
            pull: {
              user: { login: ghUser.login },
              title: {
                $in: [outdated_pyproject.title, outdated_pyproject_v2.title, outdated_publishcr.title],
              },
              body: {
                $in: [outdated_pyproject.body, outdated_pyproject_v2.body, outdated_publishcr.body],
              },
            },
          }),
        },
      }),
      // $filaten({
      //   crPulls: {
      //     data: $elemMatch({
      //       edited: {
      //         mtime: $stale("30m"), // retry if update fails
      //         state: { $ne: "ok" },
      //         error: { $nin: ["not editable", "up to date", "body mismatch"] },
      //       },
      //       pull: {
      //         updated_at: {
      //           $lte: new Date().toISOString().replace(/.\d\d\dZ/, "Z"),
      //         },
      //       },
      //     }),
      //   },
      // }),
    ),
    async (repo) => {
      const { repository } = repo;
      console.log("Updating PR templates for: " + repository);
      const crPulls = match(repo.crPulls)
        .with($OK, (e) => e.data)
        .otherwise(() => null)!;

      // edit CRPulls templates to latest
      const crPullsEdited = await pMap(
        crPulls,
        async (data, i): Promise<CRPull> => {
          const { pull, type } = data;
          const { number } = pull;
          if (pull.user.login !== ghUser.login) DIE("not editable");
          const replacement = match(pull)
            .with(pyproject, () => DIE("is already latest template"))
            .with(publishcr, () => DIE("is already latest template"))
            .with(outdated_pyproject, () => pyproject)
            .with(outdated_pyproject_v2, () => pyproject)
            .with(outdated_publishcr, () => publishcr)
            // in case author clicked some task as completed, body will be different, may cause template mismatch
            .otherwise(() => DIE("Template not found: " + pull.title));
          if (!replacement) return { ...data, edited: TaskError("Template mismatch") };

          const edited = await gh.issues
            .update({
              ...parseUrlRepoOwner(repository),
              issue_number: number,
              ...(pull.title === replacement.title ? {} : { title: replacement.title }),
              ...(pull.body === replacement.body ? {} : { body: replacement.body }),
            })
            .then(() => true as const)
            .then(TaskOK)
            .catch(TaskError);
          const updatedPull = (
            await gh.pulls.get({
              ...parseUrlRepoOwner(repository),
              pull_number: number,
            })
          ).data;
          await CNRepos.updateOne({ repository }, { $set: { [`crPulls.data.${i}.edited`]: edited } });
          return { pull: parsePull(updatedPull), type, edited };
        },
        { concurrency: 2 },
      )
        .then(TaskOK)
        .catch(TaskError);
      tsmatch(crPullsEdited)
        .with($OK, async ({ data }) => {
          await notifySlackLinks(
            `Updated PR body to latest template`,
            data.map((e) => e.pull.html_url),
          );
        })
        .otherwise(() => {});
      await CNRepos.updateOne({ repository }, { $set: { crPullsEdited } });
      // update outdated pr issue bodies
      return crPullsEdited;
    },
    { concurrency: 2 },
  );
}
