import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { TaskError, TaskErrorOrNull, TaskOK, type Task } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import { sleep } from "bun";
import { readFile } from "fs/promises";
import type { WithId } from "mongodb";
import { basename, dirname } from "path";
import sflow, { nil } from "sflow";
import { isRepoBypassed } from "./bypassRepos";
import { $ } from "./cli/echoBunShell";
import { CNRepos } from "./CNRepos";
import { createGithubForkForRepoEx } from "./createGithubForkForRepo";
import { createGithubPullRequest } from "./createGithubPullRequest";
import { $flatten, $stale, db } from "./db";
import { getBranchWorkingDir } from "./getBranchWorkingDir";
import { gh } from "@/lib/github";
import type { GithubPull } from "@/lib/github/GithubPull";
import { GIT_USEREMAIL, GIT_USERNAME } from "./ghUser";
import { parseGithubRepoUrl, stringifyGithubOrigin } from "./parseOwnerRepo";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";

type LicenseUpdateTask = {
  repository: string;
  tomlUpdated?: boolean;
  prTask: Task<unknown>;
  updatedAt?: Date;
};

const LicenseTasks = db.collection<LicenseUpdateTask>("LicenseTasks");
await LicenseTasks.createIndex({ repository: 1 }, { unique: true });

if (import.meta.main) {
  const testMapping = {
    [`license = "MIT"`]: `license = { text = "MIT" }`,
    [`license = "LICENSE.txt"`]: `license = { file = "LICENSE.txt" }`,
  };

  const _repoExamples = {
    "https://github.com/MuziekMagie/ComfyUI-Matchering": "license already updated",
    // - [ComfyUI_FizzNodes/LICENCE.txt at main · FizzleDorf/ComfyUI_FizzNodes]( https://github.com/FizzleDorf/ComfyUI_FizzNodes/blob/main/LICENCE.txt )
    "https://github.com/FizzleDorf/ComfyUI_FizzNodes": "licenCe",
  };

  await updateTomlLicenseTasks();
  console.log("ALL DONE");
}

async function _listReposWithNoLicense() {
  console.log(
    await $pipeline(CNRepos)
      .match({ cr: { $exists: true }, "info.data": { $exists: true }, "info.data.license": null })
      .project({ _id: 0, repository: 1, gh_license: "$info.data.license" })
      .aggregate()
      .next(),
  );
}

export async function updateTomlLicenseTasks() {
  // collect tasks
  await $pipeline(CNRepos)
    .match({ cr: { $exists: true } })
    .project({ _id: 0, repository: 1 })
    .match({
      repository: { $exists: true, $ne: null, $type: "string" },
    })
    .merge({ into: LicenseTasks.collectionName, on: "repository" })
    .aggregate()
    .next();

  // reset retry-able errors with a cd interval
  await LicenseTasks.updateMany(
    $flatten({ prTask: { error: /was submitted too quickly/, mtime: $stale("5m") } }),
    {
      $unset: { prTask: 1 },
    },
  );
  await LicenseTasks.updateMany(
    $flatten({ prTask: { error: /Missing env.GH_TOKEN_COMFY_PR/, mtime: $stale("1h") } }),
    {
      $unset: { prTask: 1 },
    },
  );
  console.log((await LicenseTasks.estimatedDocumentCount()) + " license tasks");

  // update tasks
  await sflow(
    $pipeline(LicenseTasks)
      .match({ tomlUpdated: { $ne: true }, updatedAt: $stale("5m") })
      .as<WithId<LicenseUpdateTask>>()
      .aggregate(),
  )
    .filter(({ repository }) => !isRepoBypassed(repository))
    .pMap(
      async ({ _id, repository }) => {
        const prTask = await createTomlLicensePR(repository).then(TaskOK).catch(TaskError);
        const tomlUpdated = !!TaskErrorOrNull(prTask)?.match("not matched outdated case");
        return await LicenseTasks.findOneAndUpdate(
          { _id },
          { $set: { tomlUpdated, prTask, updatedAt: new Date() } },
          { returnDocument: "after" },
        );
      },
      { concurrency: 3 },
    )
    .forEach(() => sleep(2e3))
    .toLog();
}

async function _testMakeUpdateTomlLicenseBranch() {
  const testUpstreamRepo = "https://github.com/snomiao/comfy-malicious-node-test";

  const prTask = await createTomlLicensePR(testUpstreamRepo).then(TaskOK).catch(TaskError);
  if (TaskErrorOrNull(prTask)?.match("Not matched outdated case"))
    console.log("not matched outdated case");
  console.log(prTask);
  console.log("prs_updateTomlLicense PRs DONE");
}

async function createTomlLicensePR(upstreamUrl: string): Promise<GithubPull> {
  const { html_url: forkUrl } = await createGithubForkForRepoEx(upstreamUrl);
  const branchInfo = await makeUpdateTomlLicenseBranch(upstreamUrl, forkUrl);
  // console.log(forkUrl); // note: this forkUrl may not be final forked url
  console.log({ branchInfo });
  return (
    (await sflow([branchInfo])
      .map(({ upstreamUrl, forkUrl, ...e }) => ({
        ...e,
        srcUrl: forkUrl,
        dstUrl: upstreamUrl,
      }))
      .map(async ({ type, ...prInfo }) => await createGithubPullRequest({ ...prInfo }))
      .forEach((e) => e || DIE("missing pr result"))
      .toOne()) ?? DIE("never")
  );
}

export async function makeUpdateTomlLicenseBranch(upstreamUrl: string, forkUrl: string) {
  const type = "licence-update" as const;
  const branch = "licence-update";
  const tmpl = await readFile("./templates/update-toml-license.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);

  // check forked repo if target branch existed
  const origin = await stringifyGithubOrigin(parseGithubRepoUrl(forkUrl));
  const repo = parseGithubRepoUrl(forkUrl);
  const existedBranch = await gh.repos.getBranch({ ...repo, branch }).catch(() => null);

  const cwd = await getBranchWorkingDir(upstreamUrl, forkUrl, branch);
  // commit changes
  await $`
rm -rf ${cwd}
git clone --single-branch ${upstreamUrl} ${cwd}
`;

  //   // also pull from existed forked branch
  //   if (existedBranch)
  //     await $`
  // cd ${cwd}
  // git pull ${forkUrl} ${branch}
  // `;

  const pyprojectToml = cwd + "/pyproject.toml";
  const { updated, license } = await pyprojectTomlUpdateLicenses(pyprojectToml, upstreamUrl);
  if (!updated) throw new Error("License field not matched outdated case, skip pr");

  if (existedBranch) {
    console.log("[debug] skip update already forked branch " + branch);
    return { type, title, body, branch, upstreamUrl, forkUrl, license };
  }

  // prepare local branch
  await $`
cd ${cwd}
git config user.name ${GIT_USERNAME} && \
git config user.email ${GIT_USEREMAIL} && \
git checkout -b ${branch} && \
git add . && \
git commit -am ${`chore(${branch}): ${title}`}
`;

  await $`
cd ${cwd}
git push "${origin}" ${branch}:${branch}
`;
  const branchUrl = `https://github.com/${repo.owner}/${repo.repo}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);

  return { type, title, body, branch, upstreamUrl, forkUrl, license };
}

export async function pyprojectTomlUpdateLicenses(tomlFile: string, upstreamRepoUrl: string) {
  const raw =
    (await Bun.file(tomlFile).text().catch(nil)) ||
    DIE(new Error("pyproject.toml file not existed or got empty file"));
  const m = raw.match(/^license\s*=(.*)/im);

  const licenseLine = m?.[0];
  const license = m?.[1]?.trim();
  const outdatedDesiredLicense = license?.match(/^"([^"\n\r]+)"$/i)?.[1];
  const isOutdated = !!outdatedDesiredLicense;
  // const isOutdated = !!raw.match(outdated);
  license &&
    (await LicenseTasks.updateOne({ repository: upstreamRepoUrl }, { $set: { license: license } }));
  if (!licenseLine) throw new Error("no license line was found, please check toml file");
  if (!isOutdated) return { updated: false }; // not outdated

  let updated: string | null = "";

  // try load local license file first
  updated ||= await (async function () {
    const desiredLicenseIsFile = !!outdatedDesiredLicense.match(/LICEN[SC]E/);
    if (!desiredLicenseIsFile) return null;
    const licenses = await Array.fromAsync(new Bun.Glob(dirname(tomlFile) + "/LICEN[CS]E*").scan()); // note: LICENCE will be mismatch in this case
    if (licenses.length > 1) DIE(new Error("Multiple license found: " + JSON.stringify(licenses)));

    const licenseFilename = licenses[0];
    if (!licenseFilename) return null;
    return `license = { file = "${basename(licenseFilename)}" }`;
  })();

  // - [Writing your pyproject.toml - Python Packaging User Guide]( https://packaging.python.org/en/latest/guides/writing-pyproject-toml/#license )
  updated ||= await (async function () {
    const resp = await gh.repos.get({ ...parseGithubRepoUrl(upstreamRepoUrl) });
    const license = resp.data.license;
    if (!license) return null;
    return `license = { text = "${license?.name}" }`;
  })();

  if (!updated)
    DIE(
      `Fail to get repo license from repo please contact author to create a license file\nMISSING_LICENSE_REPO: ${upstreamRepoUrl}`,
    );

  const replaced = raw.replace(licenseLine, () => updated);
  if (replaced === raw)
    DIE(new Error("licenseLine not matched", { cause: { raw, licenseLine, updated } }));
  await LicenseTasks.updateOne({ repository: upstreamRepoUrl }, { $set: { updateLine: updated } });
  await Bun.write(tomlFile, replaced);
  return { updated: true, license: replaced.match(/^license\s*=(.*)/i)?.[1]?.trim() };
}
