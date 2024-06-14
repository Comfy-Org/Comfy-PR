import { parseUrlRepoOwner } from "./parseOwnerRepo";

export function getRepoWorkingDir(forkUrl: string) {
  return `prs/${parseUrlRepoOwner(forkUrl).repo}`;
}
  