import { basename, dirname } from "path";

/**
 * Parse owner and repo obj
 * @param gitUrl git@github.com:owner/repo or https://github.com/owner/repo
 */
export function parseGithubRepoUrl(gitUrl: string) {
  return {
    owner: basename(dirname(gitUrl.replace(/:/, "/"))),
    repo: basename(gitUrl.replace(/:/, "/")).replace(/\.git$/, ""),
  };
}
export function stringifyOwnerRepo({ owner, repo }: ReturnType<typeof parseGithubRepoUrl>) {
  return owner + "/" + repo;
}
export function stringifyGithubRepoUrl({ owner, repo }: ReturnType<typeof parseGithubRepoUrl>) {
  return "https://github.com/" + owner + "/" + repo;
}
export async function stringifyGithubOrigin({ owner, repo }: ReturnType<typeof parseGithubRepoUrl>) {
  const PR_TOKEN = process.env.GH_TOKEN_COMFY_PR;
  if (PR_TOKEN) {
    // fails: maybe permission issue
    // const USERNAME = (
    //   await new Octokit({
    //     auth: PR_TOKEN,
    //   }).rest.users.getAuthenticated()
    // ).data.login;
    // return `https://${USERNAME}:${PR_TOKEN}@github.com/${owner}/${repo}`;

    return `git@github.com:${owner}/${repo}`;
  }
  return `git@github.com:${owner}/${repo}`;
}
