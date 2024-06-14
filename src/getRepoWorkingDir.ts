import { parseRepoUrl } from "./parseOwnerRepo";

export function getRepoWorkingDir(forkUrl: string) {
  return `prs/${parseRepoUrl(forkUrl).repo}`;
}
  