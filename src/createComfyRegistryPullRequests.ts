import pMap from "p-map";
import yaml from "yaml";
// import { chalk } from "zx";
import { clone_modify_push_Branches } from "./clone_modify_push_Branches";
import { createGithubForkForRepo } from "./createGithubForkForRepo";
import { createGithubPullRequest } from "./createGithubPullRequest";
import type { GithubPull } from "./fetchRepoPRs";

export async function createComfyRegistryPullRequests(upstreamRepoUrl: string): Promise<GithubPull[]> {
  const forkedRepo = await createGithubForkForRepo(upstreamRepoUrl);
  const PR_REQUESTS = await clone_modify_push_Branches(upstreamRepoUrl, forkedRepo.html_url);
  // branch is ready in fork now
  // create prs for each branch
  console.log("Going to create PRs for the following branches:");
  // console.log(chalk.green(yaml.stringify({ PR_REQUESTS })));
  console.log(yaml.stringify({ PR_REQUESTS }));
  // prs
  const prs = await pMap(PR_REQUESTS, async ({ type, ...prInfo }) => await createGithubPullRequest({ ...prInfo }));
  console.log("ALL PRs DONE");
  return prs as GithubPull[];
}
