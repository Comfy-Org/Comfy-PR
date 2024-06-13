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
export function stringifyGithubRemoteSSH({
  owner,
  repo,
}: ReturnType<typeof parseRepoUrl>) {
  return "git@github.com:" + owner + "/" + repo;
}
