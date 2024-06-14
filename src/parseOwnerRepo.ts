import { Octokit } from "octokit";
import { basename, dirname } from "path";

/**
 * Parse owner and repo obj
 * @param gitUrl git@github.ocm:owner/repo or https://github.ocm/owner/repo
 */
export function parseRepoUrl(gitUrl: string) {
  return {
    owner: basename(dirname(gitUrl.replace(/:/, "/"))),
    repo: basename(gitUrl.replace(/:/, "/")).replace(/\.git$/, ""),
  };
}

export function stringifyOwnerRepo({
  owner,
  repo,
}: ReturnType<typeof parseRepoUrl>) {
  return owner + "/" + repo;
}
export function stringifyGithubRepoUrl({
  owner,
  repo,
}: ReturnType<typeof parseRepoUrl>) {
  return "https://github.com/" + owner + "/" + repo;
}
export async function stringifyGithubOrigin({
  owner,
  repo,
}: ReturnType<typeof parseRepoUrl>) {
  const PR_TOKEN = process.env.GITHUB_TOKEN_COMFY_PR;

  if (PR_TOKEN) {
    const USERNAME = (
      await new Octokit({
        auth: PR_TOKEN,
      }).rest.users.getAuthenticated()
    ).data.login;
    return `https://${USERNAME}:${PR_TOKEN}@github.com/${owner}/${repo}`;
  }
  return `git@github.com:${owner}/${repo}`;
}
