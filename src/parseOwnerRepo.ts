import { basename, dirname } from "path";

/**
 * Parse owner and repo obj
 * @param gitUrl git@github.ocm:owner/repo or https://github.ocm/owner/repo
 * @returns
 */
export function repoUrlParse(gitUrl: string) {
  return {
    owner: basename(dirname(gitUrl.replace(/:/, "/"))),
    repo: basename(gitUrl.replace(/:/, "/")).replace(/\.git$/, ""),
  };
}
export function ghRepoStringify({
  owner,
  repo,
}: ReturnType<typeof repoUrlParse>) {
  return "https://github.com/" + owner + "/" + repo;
}
export function ghRepoSSHStringify({
  owner,
  repo,
}: ReturnType<typeof repoUrlParse>) {
  return "git@github.com:" + owner + "/" + repo;
}
