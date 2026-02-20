import { $elemMatch } from "@/packages/mongodb-pipeline-ts/$elemMatch";
import DIE from "@snomiao/die";
import gitDiff from "git-diff";
import isCI from "is-ci";
import stableStringify from "json-stable-stringify";
import pMap from "p-map";
import sflow from "sflow";
import { match } from "ts-pattern";
import { glob } from "zx";
import { $OK, TaskError, TaskOK, tsmatch } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos, type CRPull } from "./CNRepos";
import { $flatten, $stale } from "./db";
import { gh } from "@/lib/github";
import { parsePull } from "@/lib/github/parsePull";
import { ghUser } from "./ghUser";
import { parseGithubRepoUrl } from "./parseOwnerRepo";
import { readTemplate } from "./readTemplateTitle";
import { notifySlackLinks } from "@/lib/slack/notifySlackLinks";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  await tLog("updateOutdatedPullsTemplates", updateOutdatedPullsTemplates);
  if (isCI) process.exit(0);
}

export async function updateOutdatedPullsTemplates() {
  const pyproject = await readTemplate("./templates/add-toml.md");
  const publishcr = await readTemplate("./templates/add-action.md");
  // update toml license
  const toml = await readTemplate("./templates/update-toml-license.md");
  const outdated_toml = await readTemplate("./templates/outdated/update-toml-license.md");
  // publishcr
  const outdated_publishcr_templates = await sflow(
    await glob("./templates/outdated/add-action*.md"),
  )
    .map((file) => readTemplate(file))
    .toArray();
  // pyproject
  const outdated_pyproject_templates = await sflow(await glob("./templates/outdated/add-toml*.md"))
    .map((file) => readTemplate(file))
    .toArray();

  const outdateTitles = [
    outdated_toml.title,
    ...outdated_publishcr_templates.map((e) => e.title),
    ...outdated_pyproject_templates.map((e) => e.title),
  ];
  const outdateBodies = [
    outdated_toml.body,
    ...outdated_publishcr_templates.map((e) => e.body),
    ...outdated_pyproject_templates.map((e) => e.body),
  ];
  console.log("Outdated PR templates: ", outdateTitles.length);
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
      $flatten({
        crPulls: {
          // mtime: $fresh("1h"), // retry if update fails
          data: $elemMatch({
            edited: {
              mtime: $stale("30m"), // retry if update fails
              state: { $ne: "ok" },
              error: { $nin: ["up to date", "body mismatch"] },
            },
            pull: {
              user: { login: (await ghUser()).login },
              title: { $in: outdateTitles },
              body: { $in: outdateBodies },
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
    async (repo, i) => {
      const { repository } = repo;
      console.log(i + " Updating PR templates for: " + repository);
      const crPulls = match(repo.crPulls)
        .with($OK, (e) => e.data)
        .otherwise(() => null)!;

      // edit CRPulls templates to latest
      const crPullsEdited = await pMap(
        crPulls,
        async (data, pullIndex): Promise<CRPull> => {
          const { pull, type } = data;
          const { number } = pull;
          if (pull.user.login !== (await ghUser()).login) DIE("not editable");
          const replacement = match(pull)
            .with(pyproject, () => DIE("Is already latest, should never happen here"))
            .with(publishcr, () => DIE("Is already latest, should never happen here"))
            .with(outdated_toml, () => toml)
            .when(
              (pull) =>
                outdated_pyproject_templates
                  .map((e) => stableStringify(e))
                  .includes(stableStringify({ title: pull.title, body: pull.body })),
              () => pyproject,
            )
            .when(
              (pull) =>
                outdated_publishcr_templates
                  .map((e) => stableStringify(e))
                  .includes(stableStringify({ title: pull.title, body: pull.body })),
              () => publishcr,
            )
            // in case author clicked some task as completed, body will be different, may cause template mismatch
            .otherwise(() => DIE("Template not found: " + pull.title));
          if (!replacement) return { ...data, edited: TaskError("Template mismatch") };
          const diff = gitDiff(pull.body!, replacement.body);
          console.log(diff);

          const edited = await gh.issues
            .update({
              ...parseGithubRepoUrl(repository),
              issue_number: number,
              ...(pull.title === replacement.title ? {} : { title: replacement.title }),
              ...(pull.body === replacement.body ? {} : { body: replacement.body }),
            })
            .then(() => true as const)
            .then(TaskOK)
            .catch(TaskError);
          const updatedPull = (
            await gh.pulls.get({
              ...parseGithubRepoUrl(repository),
              pull_number: number,
            })
          ).data;
          await CNRepos.updateOne(
            { repository },
            { $set: { [`crPulls.data.${pullIndex}.edited`]: edited } },
          );
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
