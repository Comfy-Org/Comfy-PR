import { gh } from "./gh";
import { parseRepoUrl } from "./parseOwnerRepo";
import { parsePullsState } from "./parsePullsState";
import { GithubPull } from "./fetchRepoPRs";


export async function fetchGithubPulls(repository: string) {
  const data = (
    await gh.pulls.list({
      ...parseRepoUrl(repository),
      state: "all",
    })
  ).data as GithubPull[];
  return parsePullsState(data);
}
