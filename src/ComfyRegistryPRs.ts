import DIE from "@snomiao/die";
import pMap from "p-map";
import yaml from "yaml";
import { chalk } from "zx";
import { clone_modify_push_Branches } from "./clone_modify_push_Branches";
import { createGithubFork } from "./createGithubFork";
import type { GithubPull } from "./fetchRepoPRs";
import { createGithubPullRequest } from "./ghPullRequest";

export async function ComfyRegistryPRs(
  upstreamRepoUrl: string,
): Promise<GithubPull[]> {
  const forkedRepo = await createGithubFork(upstreamRepoUrl);
  const PR_REQUESTS = await clone_modify_push_Branches(
    upstreamRepoUrl,
    forkedRepo.html_url,
  );
  // branch is ready in fork now

  DIE("check forks plz");
  // create prs for each branch
  console.log("PR Infos");
  console.log(chalk.green(yaml.stringify({ PR_REQUESTS })));
  // prs
  const prs = await pMap(
    PR_REQUESTS,
    async ({ type, ...prInfo }) => await createGithubPullRequest({ ...prInfo }),
  );
  console.log("ALL PRs DONE");
  return prs as GithubPull[];
}
