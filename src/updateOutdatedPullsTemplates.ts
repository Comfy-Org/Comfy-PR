import pMap from "p-map";
import { match } from "ts-pattern";
import { user } from ".";
import { CNRepos } from "./CNRepos";
import { $OK } from "./Task";
import { $elemMatch } from "./db/$elemMatch";
import { $flatten } from "./db/$flatten";
import { readTemplate } from "./readTemplateTitle";
import { tLog } from "./utils/tLog";
import { $fresh, $stale } from "./db";
// await CNRepos.createIndex({
//   "crPulls.data.pull.body": -1,
//   "crPulls.data.edited.mtime": -1,
//   // "crPulls.data.edited.state": -1,
//   // "crPulls.data.edited.error": -1,
//   // "crPulls.data.pull.updated_at": -1,
//   // "crPulls.data.edited.mtime": -1,
//   // "crPulls.data.edited.state": -1,
//   // "crPulls.data.edited.error": -1,
// });
if (import.meta.main) {
  await tLog("updateOutdatedPullsTemplates", updateOutdatedPullsTemplates);
}

export async function updateOutdatedPullsTemplates() {
  const pyproject = await readTemplate("add-toml.md");
  const publishcr = await readTemplate("add-action.md");
  const outdated_pyproject = await readTemplate("outdated/add-toml.md");
  const outdated_publishcr = await readTemplate("outdated/add-action.md");
  // const templateOutdate = new Date("2024-06-13T09:02:56.630Z");

  return await pMap(
    CNRepos.find(
      $flatten({
        crPulls: {
          mtime: $fresh("1d"),
          // data: $elemMatch({
          //   // edited: {
          //   //   mtime: $stale("30m"), // retry if update fails
          //   //   state: { $ne: "ok" },
          //   //   error: { $nin: ["up to date", "body mismatch"] },
          //   // },
          //   pull: {
          //     // user: { login: user.login },
          //     title: outdated_pyproject.title,
              
          //     // title: {
          //     //   $in: [outdated_pyproject.title, outdated_publishcr.title],
          //     // },
          //     // body: {
          //     //   $in: [outdated_pyproject.body, outdated_publishcr.body],
          //     // },
          //   },
          // }),
        },
      }),
      // $flatten({
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
      console.log("Updating PR templates for: " + repo.repository);
      const crPulls = match(repo.crPulls)
        .with($OK, (e) => e.data)
        .otherwise(() => null)!;
      // edit CRPulls templates to latest
      // const crPullsEdited = await pMap(
      //   crPulls,
      //   async (data): Promise<EditedRelatedPull> => {
      //     const { pull, type } = data;
      //     const { repository } = repo;
      //     const { number } = pull;
      //     if (pull.user.login !== user.login)
      //       return { ...data, edited: TaskError("not editable") }; // not editable
      //     const template = match(pull)
      //       .with({ title: pyproject.title }, () => pyproject)
      //       .with({ title: publishcr.title }, () => publishcr)
      //       .otherwise(() => DIE("Template not found: " + pull.title));

      //     const replacement = match(pull)
      //       .with(
      //         {
      //           body: outdated_pyproject.body,
      //           title: outdated_pyproject.title,
      //         },
      //         () => ({ outdated: outdated_pyproject, updated: pyproject }),
      //       )
      //       .with(
      //         {
      //           body: outdated_publishcr.body,
      //           title: outdated_publishcr.title,
      //         },
      //         () => ({ outdated: outdated_publishcr, updated: publishcr }),
      //       )
      //       .otherwise(() => null);

      //     if (!replacement)
      //       return { ...data, edited: TaskError("body mismatch") };

      //     // pull
      //     // TODO: match outdated template to ensure no others are edited

      //     if (type === "pyproject" && template.title !== pyproject.title)
      //       DIE("template title mismatch");
      //     if (type === "publishcr" && template.title !== publishcr.title)
      //       DIE("template title mismatch");
      //     const body = template.body;

      //     const updatedIssue = await gh.issues
      //       .update({
      //         ...parseUrlRepoOwner(repository),
      //         issue_number: number,
      //         body,
      //       })
      //       .then(TaskOK)
      //       .catch(TaskError);
      //     const updatedPull = (
      //       await gh.pulls.get({
      //         ...parseUrlRepoOwner(repository),
      //         pull_number: number,
      //       })
      //     ).data;
      //     return { pull: updatedPull, type, edited: TaskOK(true) };
      //   },
      //   { concurrency: 1 },
      // )
      //   .then(TaskOK)
      //   .catch(TaskError);
      // match(crPullsEdited)
      //   .with($OK, async ({ data }) => {
      //     await notifySlackLinks(
      //       `Updated PR body to latest template`,
      //       data.map((e) => e.pull.html_url),
      //     );
      //   })
      //   .otherwise(() => {});
      // await CNRepos.updateOne(
      //   { repository: repo.repository },
      //   { $set: { crPullsEdited } },
      // );
      // // update outdated pr issue bodies
      // return crPullsEdited;
    },
    { concurrency: 1 },
  );
}
