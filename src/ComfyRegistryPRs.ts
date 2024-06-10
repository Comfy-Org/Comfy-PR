import { rm } from "fs/promises";
import md5 from "md5";
import yaml from "yaml";
import { argv, chalk } from "zx";
import { repoUrlParse } from "./parseOwnerRepo";
import { ghFork } from "./ghFork";
import { pushBranchPublish } from "./pushBranchPublish";
import { pushTomlBranch } from "./pushTomlBranch";
import { ghPullRequest } from "./ghPullRequest";
import { user, FORK_PREFIX, FORK_OWNER } from ".";

export async function ComfyRegistryPRs(upstreamUrl: string) {
  // Repo Define
  const upstream = repoUrlParse(upstreamUrl);
  const salt = argv.salt || process.env.SALT || "m3KMgZ2AeZGWYh7W";
  console.log(`* Change env.SALT=${salt} will fork into a different repo`);
  const repo_hash = md5(
    `${salt}-${user.name}-${upstream.owner}/${upstream.repo}`
  ).slice(0, 8);
  const forkRepoName =
    (FORK_PREFIX && `${FORK_PREFIX}${upstream.repo}-${repo_hash}`) ||
    upstream.repo;
  const forkDst = `${FORK_OWNER}/${forkRepoName}`;
  const forkUrl = `https://github.com/${forkDst}`;
  const forkSSHUrl = `git@github.com:${forkDst}`;
  const src = repoUrlParse(forkSSHUrl);
  // console.log("PR_SRC: ", forkSSHUrl);
  // console.log("PR_DST: ", upstreamUrl);
  // console.log(forkSSHUrl);
  console.log("Cleaning the pr before run");
  const dir = `prs/${src.repo}`;
  await rm(dir, { recursive: true }).catch(() => null);

  //   FORK
  await ghFork(upstreamUrl, forkSSHUrl);

  // prInfos
  const PR_REQUESTS = (
    await Promise.all([
      pushBranchPublish(dir, upstreamUrl, forkSSHUrl),
      pushTomlBranch(dir, upstreamUrl, forkSSHUrl),
    ])
  ).map((content) => ({
    ...content,
    srcUrl: forkUrl,
    dstUrl: upstreamUrl,
  }));

  console.log("PR Infos");
  console.log(chalk.green(yaml.stringify({ PR_REQUESTS })));
  // prs
  const prs = await Promise.all(PR_REQUESTS.map((prInfo) => ghPullRequest({ ...prInfo })));
  console.log("ALL PRs DONE");
  return prs
}
