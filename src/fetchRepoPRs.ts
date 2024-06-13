import Keyv from "keyv";
import { mkdir } from "fs/promises";
import { gh } from "./gh";
import { parseRepoUrl } from "./parseOwnerRepo";
import { KeyvCachedWith } from "keyv-cached-with";
import { db } from "./db";
import { pickAll, times } from "rambda";
import { CNRepos } from "./CNRepos";
import { YAML } from "zx";

if (import.meta.main) {
  // const repo = "https://github.com/ltdrdata/ComfyUI-Manager";
  // const repo = "https://github.com/WASasquatch/PPF_Noise_ComfyUI";
  const repo = "https://github.com/Lev145/images-grid-comfy-plugin";
  const pulls = await fetchGithubPulls(repo);
  console.log(pulls.length);
  // const relatedTitle = "Add pyproject.toml for Custom Node Registry";
  const relatedTitle = "Add Github Action for Publishing to Comfy Registry";
  const pull = pulls.find((e) => e.title === relatedTitle)!;
  console.log(JSON.stringify({ pull }));
  const comments = await fetchPullComments(repo, { number: 11 });
  console.log(YAML.stringify(comments));
}

export type GithubPull = Awaited<ReturnType<typeof fetchGithubPulls>>[number];
export type GithubPullComment = Awaited<
  ReturnType<typeof fetchPullComments>
>[number];

export async function fetchPullComments(
  repo: string,
  pull: { number: number }
) {
  const result = (
    await gh.issues.listComments({
      ...parseRepoUrl(repo),
      issue_number: pull.number,
      direction: "asc",
      sort: "created",
    })
  ).data;
  console.log(
    `[INFO] fetchd Pull Comments (${result.length}) from ${repo} #${pull.number}`
  );
  return result;
}

export async function fetchGithubPulls(repository: string) {
  return (
    await gh.pulls.list({
      ...parseRepoUrl(repository),
      state: "all",
    })
  ).data.map((e) => ({
    ...e,
    state:
      e.state === "open"
        ? ("open" as const)
        : e.merged_at
        ? ("merged" as const)
        : ("closed" as const),
  }));
}
