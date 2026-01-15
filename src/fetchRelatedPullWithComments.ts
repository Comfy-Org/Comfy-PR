import pMap from "p-map";
import { fetchIssueComments } from "@/lib/github/fetchIssueComments";
import { matchRelatedPulls } from "./matchRelatedPulls";
import type { GithubPullParsed } from "./parsePullsState";
import { summaryLastPullComment } from "./summaryLastPullComment";
/** @deprecated */
export async function fetchRelatedPullWithComments(repository: string, pulls: GithubPullParsed[]) {
  const relatedPulls = await matchRelatedPulls(pulls);
  const relatedPullsWithComment = await pMap(relatedPulls, async (data) => {
    const comments = await fetchIssueComments(repository, data.pull);
    const lastText = summaryLastPullComment(comments);
    return { ...data, comments, lastText };
  });
  return relatedPullsWithComment;
}
