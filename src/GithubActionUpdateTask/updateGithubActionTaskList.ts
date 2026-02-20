import { resetErrorForGithubActionUpdateTask } from "@/app/tasks/github-action-update/actions";
import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { writeFile } from "fs/promises";
import isCI from "is-ci";
import sflow from "sflow";
import yaml from "yaml";
import { CRNodes } from "../CRNodes";
import { getWorkerInstance } from "../WorkerInstances";
import { GithubActionUpdateTask } from "./GithubActionUpdateTask";
import { updateGithubActionPrepareBranchBanPatterns } from "./updateGithubActionPrepareBranch";
import { updateGithubActionTask } from "./updateGithubActionTask";

if (import.meta.main) {
  // const repo = "https://github.com/54rt1n/ComfyUI-DareMerge";
  const _repo = "https://github.com/snomiao/ComfyUI-DareMerge-test";
  // await GithubActionUpdateTask.findOneAndDelete({ repo });

  // aprove test
  // const approvedHash = "e6de732024cf2b64488ec093818fc2e01707c9bc97d306a42b3c22d2ef834686";
  // await approveGithubActionUpdateTask(repo, approvedHash);

  // test on single repo
  // await updateGithubActionTask(repo);

  // reset retryable error
  await sflow(GithubActionUpdateTask.find({ error: /\bRETRYABLE\b/ }))
    .forEach((e) => resetErrorForGithubActionUpdateTask(e.repo))
    .run();
  await sflow(GithubActionUpdateTask.find({ error: /\bpullRequestCommentsCount not match\b/ }))
    .forEach((e) => resetErrorForGithubActionUpdateTask(e.repo))
    .run();
  await sflow(GithubActionUpdateTask.find({ error: /missing env\./i }))
    .forEach((e) => resetErrorForGithubActionUpdateTask(e.repo))
    .run();

  // simplify error "Repository was archived so is read-only."
  await GithubActionUpdateTask.updateMany(
    { error: /Repository was archived so is read-only\./ },
    { $set: { error: "Repository was archived so is read-only." } },
  );

  // reset silly pr messages
  const silly = await sflow(
    ...updateGithubActionPrepareBranchBanPatterns.map((pattern) =>
      GithubActionUpdateTask.find({ pullRequestMessage: pattern }),
    ),
    GithubActionUpdateTask.find({
      pullRequestMessage: /\+\s+if: \${{ github.repository_owner == 'NODE_AUTHOR_OWNER' }}$/gim,
    }),
    GithubActionUpdateTask.find({
      pullRequestMessage: new RegExp(
        "- ## Add your own personal access token to your Github Repository secrets and reference it here.",
      ),
    }),
  )
    .log((e) => yaml.stringify(e))
    .map((e, index) => ({ ...e, index }))
    .forEach(async (e) => await GithubActionUpdateTask.deleteMany({ _id: e._id }))
    .toArray();

  await writeFile("./.cache/" + import.meta.file + "-silly-log.yaml", yaml.stringify(silly)).catch(
    () => {
      console.error("Error writing silly-log file");
    },
  );

  await updateGithubActionTaskList();

  console.log("done");

  if (isCI) process.exit(0);
}

async function updateGithubActionTaskList() {
  await getWorkerInstance("updateGithubActionTaskList");

  // task list importer
  await GithubActionUpdateTask.createIndex({ repo: 1 }, { unique: true });
  await $pipeline(CRNodes)
    .project({ repo: "$repository", _id: 0 })
    .match({ repo: /^https:\/\/github\.com/ })
    .merge({ into: GithubActionUpdateTask.collectionName, on: "repo", whenMatched: "merge" })
    .aggregate()
    .next();

  // auto reset network error
  await GithubActionUpdateTask.deleteMany({ error: /was submitted too quickly/ });

  console.log({ GithubActionUpdateTask: await GithubActionUpdateTask.find().toArray() });

  // task list scanner
  await sflow(GithubActionUpdateTask.find({ error: { $exists: false } }).project({ repo: 1 }))
    .map(async ({ repo }) => {
      console.log("-");
      return await updateGithubActionTask(repo).catch(async (err) => {
        console.error(err);
        const error = String(err);
        await GithubActionUpdateTask.updateOne(
          { repo },
          { $set: { error, updatedAt: new Date() } },
          { upsert: true },
        );
        // throw err;
      });
    })
    .run();

  // console.log(yaml.stringify({ GithubActionUpdateTask: await GithubActionUpdateTask.find().toArray() }));
  console.log("done");
}
