import DIE from "@snomiao/die";
import md5 from "md5";
import minimist from "minimist";
import { FORK_OWNER } from "./FORK_OWNER";
import { FORK_PREFIX } from "./FORK_PREFIX";
import { createGithubFork } from "./gh/createGithubFork";
import { ghUser } from "./ghUser";
import { parseUrlRepoOwner } from "./parseOwnerRepo";

/**
 * this function creates a fork of the upstream repo,
 * fork to the FORK_OWNER, and add a prefix to the repo name
 * - the prefix is optional, if not provided, the repo name will be the same as the upstream repo
 * - the prefix is useful to distinguish the forked repo from the other repo in the same owner
 * SALT is used to generate a unique repo name, so that the forked repo will not conflict with other forks
 *
 * @author snomiao <snomiao@gmail.com>
 * @param upstreamRepoUrl
 * @returns forked repo info
 */
export async function createGithubForkForRepo(upstreamRepoUrl: string) {
  // debug
  // console.log(`* Change env.SALT=${salt} will fork into a different repo`);
  // console.log("PR_SRC: ", forkSSHUrl);
  // console.log("PR_DST: ", upstreamUrl);
  // console.log(forkSSHUrl);
  const upstream = parseUrlRepoOwner(upstreamRepoUrl);
  const argv = minimist(process.argv.slice(2));
  const salt = argv.salt || process.env.SALT || "m3KMgZ2AeZGWYh7W";
  const repo_hash = md5(`${salt}-${ghUser.name}-${upstream.owner}/${upstream.repo}`).slice(0, 8);
  const forkRepoName = (FORK_PREFIX && `${FORK_PREFIX}${upstream.repo}-${repo_hash}`) || upstream.repo;
  const forkDst = `${FORK_OWNER}/${forkRepoName}`;
  const forkUrl = `https://github.com/${forkDst}`;
  const forked = await createGithubFork(upstreamRepoUrl, forkUrl);
  if (forked.html_url !== forkUrl)
    DIE(
      "forked url not expected, it's likely you already forked this repo in your account before, and now trying to fork it again with different salt. To recovery you could delete that repo forked before by manual. (the repo forked before is listed in FORK OK: .....)",
    );
  return forked;
}
