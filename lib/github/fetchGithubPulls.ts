import { gh } from ".";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { parsePulls } from "@/src/parsePullsState";
import type { GithubPull } from "./GithubPull";
export async function fetchGithubPulls(repository: string) {
  const data = (
    await gh.pulls.list({
      ...parseGithubRepoUrl(repository),
      state: "all",
    })
  ).data as GithubPull[];
  return parsePulls(data);
}
