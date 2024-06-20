import { gh } from ".";
import { parseUrlRepoOwner } from "../parseOwnerRepo";
import { parsePulls } from "../parsePullsState";
import type { GithubPull } from "./GithubPull";
export async function fetchGithubPulls(repository: string) {
  const data = (
    await gh.pulls.list({
      ...parseUrlRepoOwner(repository),
      state: "all",
    })
  ).data as GithubPull[];
  return parsePulls((data));
}
