import YAML from "yaml";
import { fetchGithubPulls } from "./fetchGithubPulls";
import { fetchIssueComments } from "./fetchPullComments";
import { gh } from "./gh";

if (import.meta.main) {
  // const repo = "https://github.com/ltdrdata/ComfyUI-Manager";
  // const repo = "https://github.com/WASasquatch/PPF_Noise_ComfyUI";
  const repo = "https://github.com/LEv145/images-grid-comfy-plugin";
  const pulls = await fetchGithubPulls(repo);
  console.log(pulls.length);
  // const relatedTitle = "Add pyproject.toml for Custom Node Registry";
  const relatedTitle = "Add Github Action for Publishing to Comfy Registry";
  const pull = pulls.find((e) => e.title === relatedTitle)!;
  console.log(JSON.stringify({ pull }));
  const comments = await fetchIssueComments(repo, { number: 11 });
  console.log(YAML.stringify(comments));
}

export type GithubPull = Awaited<ReturnType<typeof gh.pulls.get>>["data"];
export type GithubIssueComments = Awaited<ReturnType<typeof fetchIssueComments>>[number];
