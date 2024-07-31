import pMap from "p-map";
// import { chalk } from "zx";
import { clone_modify_push_Branches } from "./clone_modify_push_Branches";
import { createGithubForkForRepo } from "./createGithubForkForRepo";
import { createGithubPullRequest } from "./createGithubPullRequest";
import type { GithubPull } from "./gh/GithubPull";
import { makeUpdateTomlLicenseBranch } from "./makeUpdateTomlLicenseBranch";
import { parsePulls } from "./parsePullsState";

export async function createComfyRegistryPullRequests(upstreamRepoUrl: string) {
  const forkedRepo = await createGithubForkForRepo(upstreamRepoUrl);

  // const PR_REQUESTS_updateTomlLicense = await clone_modify_push_Branches_for_updateTomlLicense(
  //   upstreamRepoUrl,
  //   forkedRepo.html_url,
  // );
  // const prs_updateTomlLicense = await pMap(
  //   PR_REQUESTS_updateTomlLicense,
  //   async ({ type, ...prInfo }) => await createGithubPullRequest({ ...prInfo }),
  // );

  // console.log("prs_updateTomlLicense PRs DONE");

  const PR_REQUESTS = await clone_modify_push_Branches(upstreamRepoUrl, forkedRepo.html_url);
  const prs = await pMap(PR_REQUESTS, async ({ type, ...prInfo }) => await createGithubPullRequest({ ...prInfo }));

  console.log("Registry PRs DONE");

  return ([...prs] as GithubPull[]).map((e) => parsePulls([e])[0]);
}

export async function clone_modify_push_Branches_for_updateTomlLicense(upstreamUrl: string, forkUrl: string) {
  return (await Promise.all([makeUpdateTomlLicenseBranch(upstreamUrl, forkUrl)]))
    .flatMap((e) => (e ? [e] : []))
    .map(({ body, branch, title, type }) => ({
      body,
      branch,
      title,
      type,
      srcUrl: forkUrl,
      dstUrl: upstreamUrl,
    }));
}
