import type { GithubPull } from "./fetchRepoPRs";
import { gh } from "./gh";
import { parseRepoUrl } from "./parseOwnerRepo";
import { parsePullsState } from "./parsePullsState";

export async function fetchGithubPulls(repository: string) {
  const data = (
    await gh.pulls.list({
      ...parseRepoUrl(repository),
      state: "all",
    })
  ).data as GithubPull[];
  return parsePullsState(data);
}
