import md5 from "md5";
import pMap from "p-map";
import yaml from "yaml";
import { argv, chalk } from "zx";
import { FORK_OWNER, FORK_PREFIX, user } from ".";
import type { GithubPull } from "./fetchRepoPRs";
import { ghFork } from "./ghFork";
import { createGithubPullRequest } from "./ghPullRequest";
import { makePublishBranch } from "./makePublishBranch";
import { makeTomlBranch } from "./makeTomlBranch";
import { parseRepoUrl } from "./parseOwnerRepo";

export async function ComfyRegistryPRs(
  upstreamUrl: string,
): Promise<GithubPull[]> {
  // Repo Define
  const upstream = parseRepoUrl(upstreamUrl);
  const salt = argv.salt || process.env.SALT || "m3KMgZ2AeZGWYh7W";
  console.log(`* Change env.SALT=${salt} will fork into a different repo`);
  const repo_hash = md5(
    `${salt}-${user.name}-${upstream.owner}/${upstream.repo}`,
  ).slice(0, 8);
  const forkRepoName =
    (FORK_PREFIX && `${FORK_PREFIX}${upstream.repo}-${repo_hash}`) ||
    upstream.repo;
  const forkDst = `${FORK_OWNER}/${forkRepoName}`;
  const forkUrl = `https://github.com/${forkDst}`;
  // console.log("PR_SRC: ", forkSSHUrl);
  // console.log("PR_DST: ", upstreamUrl);
  // console.log(forkSSHUrl);
  //   FORK
  const forkedRepo = await ghFork(upstreamUrl, forkUrl);

  // prInfos
  const forkSSHUrl = `git@github.com:${forkDst}`;
  const PR_REQUESTS = await publishBranches(upstreamUrl, forkUrl);

  // branch ready in fork

  // create prs

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

async function publishBranches(upstreamUrl: string, forkUrl: string) {
  return (
    await Promise.all([
      makePublishBranch(upstreamUrl, forkUrl),
      makeTomlBranch(upstreamUrl, forkUrl),
    ])
  ).map((content) => ({
    ...content,
    srcUrl: forkUrl,
    dstUrl: upstreamUrl,
  }));
}
