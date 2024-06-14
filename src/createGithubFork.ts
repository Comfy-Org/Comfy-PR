import DIE from "@snomiao/die";
import md5 from "md5";
import { argv } from "zx";
import { FORK_OWNER, FORK_PREFIX, user } from ".";
import { ghFork } from "./ghFork";
import { parseRepoUrl } from "./parseOwnerRepo";

export async function createGithubFork(upstreamRepoUrl: string) {
  // debug
  // console.log(`* Change env.SALT=${salt} will fork into a different repo`);
  // console.log("PR_SRC: ", forkSSHUrl);
  // console.log("PR_DST: ", upstreamUrl);
  // console.log(forkSSHUrl);
  const upstream = parseRepoUrl(upstreamRepoUrl);
  const salt = argv.salt || process.env.SALT || "m3KMgZ2AeZGWYh7W";
  const repo_hash = md5(
    `${salt}-${user.name}-${upstream.owner}/${upstream.repo}`
  ).slice(0, 8);
  const forkRepoName = (FORK_PREFIX && `${FORK_PREFIX}${upstream.repo}-${repo_hash}`) ||
    upstream.repo;
  const forkDst = `${FORK_OWNER}/${forkRepoName}`;
  const forkUrl = `https://github.com/${forkDst}`;
  const forked = await ghFork(upstreamRepoUrl, forkUrl);
  if (forked.html_url !== forkUrl) DIE("forked url not expected");
  return forked;
}
