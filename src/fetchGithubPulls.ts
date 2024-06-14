import type { GithubPull } from "./fetchRepoPRs";
import { gh } from "./gh";
import { parseUrlRepoOwner } from "./parseOwnerRepo";
import { parsePullsState } from "./parsePullsState";

export async function fetchGithubPulls(repository: string) {
  const data = (
    await gh.pulls.list({
      ...parseUrlRepoOwner(repository),
      state: "all",
    })
  ).data as GithubPull[];
  return parsePullsState(data);
}
