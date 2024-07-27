import DIE from "@snomiao/die";
import { readFile } from "fs/promises";
import pMap from "p-map";
import { basename, dirname } from "path";
import sflow from "sflow";
import { GIT_USEREMAIL } from "./GIT_USEREMAIL";
import { GIT_USERNAME } from "./GIT_USERNAME";
import { $ } from "./cli/echoBunShell";
import { clone_modify_push_Branches_for_updateTomlLicense } from "./createComfyRegistryPullRequests";
import { createGithubForkForRepo } from "./createGithubForkForRepo";
import { createGithubPullRequest } from "./createGithubPullRequest";
import { getBranchWorkingDir } from "./getBranchWorkingDir";
import { gh } from "./gh";
import { parseUrlRepoOwner, stringifyGithubOrigin } from "./parseOwnerRepo";
import { parsePullUrl } from "./parsePullUrl";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";

if (import.meta.main) {
  //   await _pullTemplate();
  //   const testUpstreamRepo = "https://github.com/haohaocreates/ComfyUI-HH-Image-Selector";
  const testUpstreamRepo = "https://github.com/snomiao/comfy-malicious-node-test";
  const forkedRepo = await createGithubForkForRepo(testUpstreamRepo);
  const forkUrl = forkedRepo.html_url;
  console.log(forkUrl);
  await makeUpdateTomlLicenseBranch(testUpstreamRepo, forkUrl);

  // process.env.GH_TOKEN_COMFY_PR = process.env.GH_TOKEN // uncomment to set token for make pr
  const upstreamRepoUrl = testUpstreamRepo;
  const PR_REQUESTS_updateTomlLicense = await clone_modify_push_Branches_for_updateTomlLicense(
    upstreamRepoUrl,
    forkedRepo.html_url,
  );
  const prs_updateTomlLicense = await pMap(
    PR_REQUESTS_updateTomlLicense,
    async ({ type, ...prInfo }) => await createGithubPullRequest({ ...prInfo }),
  );

  console.log("prs_updateTomlLicense PRs DONE");
}

export async function makeUpdateTomlLicenseBranch(upstreamUrl: string, forkUrl: string) {
  const type = "licence-update" as const;
  const origin = await stringifyGithubOrigin(parseUrlRepoOwner(forkUrl));
  const branch = "licence-update";
  const tmpl = await readFile("./templates/add-toml.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = parseUrlRepoOwner(forkUrl);

  // info.license?.url
  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    console.log("Skip changes as forked branch existed: " + branch);
    return { type, title, body, branch };
  }
  const cwd = await getBranchWorkingDir(upstreamUrl, forkUrl, branch);

  // commit changes
  await $`
git clone ${upstreamUrl} ${cwd}

cd ${cwd}
`;

  const pyprojectToml = cwd + "/pyproject.toml";
  const { changed } = await pyprojectTomlUpdateLicenses(pyprojectToml, upstreamUrl);
  if (!changed) return; // not changed

  await $`
cd ${cwd}
git config user.name ${GIT_USERNAME} && \
git config user.email ${GIT_USEREMAIL} && \
git checkout -b ${branch} && \
git add . && \
git commit -am ${`chore(${branch}): ${title}`} && \
git push "${origin}" ${branch}:${branch}
`;
  const branchUrl = `https://github.com/${repo.owner}/${repo.repo}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { type, title, body, branch };
}

export async function pyprojectTomlUpdateLicenses(tomlFile: string, upstreamRepoUrl: string) {
  const raw = await Bun.file(tomlFile).text();
  const outdated = `license = "LICENSE"`;
  if (!raw.match(outdated)) return { changed: false }; // not outdated

  let updated: string | null = "";
  // try load local license file first
  updated ||= await (async function () {
    const licenses = await Array.fromAsync(new Bun.Glob(dirname(tomlFile) + "/LICENSE*").scan());
    if (licenses.length > 1) DIE("Multiple license found: " + JSON.stringify(licenses));

    const licenseFilename = licenses[0];
    if (!licenseFilename) return null;
    return `license = { file = "${basename(licenseFilename)}" }`;
  })();

  // - [Writing your pyproject.toml - Python Packaging User Guide]( https://packaging.python.org/en/latest/guides/writing-pyproject-toml/#license )
  updated ||= await (async function () {
    const resp = await gh.repos.get({ ...parseUrlRepoOwner(upstreamRepoUrl) });
    const license = resp.data.license;
    if (!license) return null;
    return `license = { text = "${license?.name}" }`;
  })();
  if (!updated) DIE("Fail to get license from " + upstreamRepoUrl);

  const replaced = raw.replace(outdated, () => updated);
  await Bun.write(tomlFile, replaced);
  return { changed: true };
}

/** use when template updated */
async function _pullTemplate() {
  const referenceTemplate = "https://github.com/haohaocreates/ComfyUI-HH-Image-Selector/pull/3";
  const template = await sflow(gh.pulls.get(parsePullUrl(referenceTemplate)))
    .map((e) => e.data.body!)
    .text();
  await Bun.write("./templates/update-toml-license.md", template);
  console.log(template);
}
