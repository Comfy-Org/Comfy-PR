import pMap from "p-map";
import { fetchPullComments } from "./fetchPullComments";
import { type GithubPull } from "./fetchRepoPRs";
import { summaryLastPullComment } from "./summaryLastPullComment";
import { matchRelatedPulls } from "./fetchRelatedPulls";
import DIE from "@snomiao/die";
import { CNRepos } from "./CNRepos";
import { $OK } from "./Task";
import { match } from "ts-pattern";

if (import.meta.main) {
  // const repository = "https://github.com/ltdrdata/ComfyUI-Manager";
  // const repo = "https://github.com/WASasquatch/PPF_Noise_ComfyUI";
  const repository = "https://github.com/LEv145/images-grid-comfy-plugin";
  const cnrepo = (await CNRepos.findOne({ repository })) ?? DIE("Repo not found");
  const pulls = match(cnrepo.pulls)
    .with($OK, ({ data }) => data)
    .otherwise(() => DIE("Pulls not found"));
  const related = await fetchRelatedPullWithComments(repository, pulls);
  console.log(JSON.stringify(related));
  // await checkAllRepoPRStatus();
}
export async function fetchRelatedPullWithComments(repository: string, pulls: GithubPull[]) {
  const relatedPulls = await matchRelatedPulls(pulls);
  const relatedPullsWithComment = await pMap(relatedPulls, async (data) => {
    const comments = await fetchPullComments(repository, data.pull);
    const lastText = summaryLastPullComment(comments);
    return { ...data, comments, lastText };
  });
  return relatedPullsWithComment;
}
