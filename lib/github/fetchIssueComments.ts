import { gh } from ".";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { yaml } from "@/src/utils/yaml";
import { fetchGithubPulls } from "./fetchGithubPulls";
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
  console.log(yaml.stringify(comments));
}

export async function fetchIssueComments(repo: string, pull: { number: number }) {
  const result = (
    await gh.issues.listComments({
      ...parseGithubRepoUrl(repo),
      issue_number: pull.number,
      direction: "asc",
      sort: "created",
    })
  ).data;
  console.log(`[INFO] Fetchd ${result.length} Comments from ${repo}/pull/${pull.number}`);
  return result;
}
