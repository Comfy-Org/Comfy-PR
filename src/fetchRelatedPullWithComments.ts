import pMap from "p-map";
import { fetchIssueComments } from "./fetchPullComments";
import { matchRelatedPulls } from "./fetchRelatedPulls";
import { type GithubPull } from "./fetchRepoPRs";
import { summaryLastPullComment } from "./summaryLastPullComment";

export async function fetchRelatedPullWithComments(repository: string, pulls: GithubPull[]) {
  const relatedPulls = await matchRelatedPulls(pulls);
  const relatedPullsWithComment = await pMap(relatedPulls, async (data) => {
    const comments = await fetchIssueComments(repository, data.pull);
    const lastText = summaryLastPullComment(comments);
    return { ...data, comments, lastText };
  });
  return relatedPullsWithComment;
}
