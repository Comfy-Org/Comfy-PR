import minimist from "minimist";
import pMap from "p-map";
import { createGithubForkForRepoEx } from "./createGithubForkForRepo";
import { createGithubPullRequest } from "./createGithubPullRequest";
import type { GithubPull } from "@/lib/github/GithubPull";
import { makeGpl3LicenseBranch } from "./makeGpl3LicenseBranch";
import { makePublishcrBranch } from "./makePublishBranch";
import { makePyprojectBranch } from "./makeTomlBranch";
import { parsePulls } from "./parsePullsState";
if (import.meta.main) {
  // test repo
  // const default_test_repo = "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler";
  const default_test_repo = "https://github.com/snomiao/ComfyNode-Registry-test";
  const test_repo = minimist(process.argv.slice(2)).argv || default_test_repo;
  console.info(await createComfyRegistryPullRequests(test_repo));
}

export async function createComfyRegistryPullRequests(upstreamRepoUrl: string) {
  console.log("forking " + upstreamRepoUrl);
  const forkedRepo = await createGithubForkForRepoEx(upstreamRepoUrl);

  console.log("modifing " + forkedRepo.html_url);
  const PR_REQUESTS = await clone_modify_push_Branches(upstreamRepoUrl, forkedRepo.html_url);
  const prs = await pMap(
    PR_REQUESTS,
    async ({ type: _type, ...prInfo }) => await createGithubPullRequest({ ...prInfo }),
  );

  console.log("Registry PRs DONE");

  return ([...prs] as GithubPull[]).map((e) => parsePulls([e])[0]);
}

/**
 * this function will:
 *
 * for each branch (pyproject, publishcr)
 * 1. clone forked srepo
 * 2. modify on forked repo (add pyproject.toml, add .github/workflow/publish.yml)
 * 3. commit changes, push to forked repo
 * 4. check if all branch is ready, create PR to upstream repo
 */
export async function clone_modify_push_Branches(upstreamUrl: string, forkUrl: string) {
  const pyprojectBranchInfo = makePyprojectBranch(upstreamUrl, forkUrl);
  const publishcrBranchInfo = makePublishcrBranch(upstreamUrl, forkUrl);
  const gpl3LicenseBranchInfo = makeGpl3LicenseBranch(upstreamUrl, forkUrl);
  return (await Promise.all([pyprojectBranchInfo, publishcrBranchInfo, gpl3LicenseBranchInfo]))
    .filter((info): info is NonNullable<typeof info> => info !== null)
    .map(({ body, branch, title, type }) => ({
      body,
      branch,
      title,
      type,
      srcUrl: forkUrl,
      dstUrl: upstreamUrl,
    }));
}
