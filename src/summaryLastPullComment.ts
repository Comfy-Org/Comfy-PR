import { type GithubIssueComment } from "./GithubIssueComments";

export function summaryLastPullComment(comments: GithubIssueComment[]) {
  // assume ascending order
  const last = comments.toReversed()[0];
  const lastText = (last ?? "") && "@" + last.user!.name + ":" + last.body!.replace(/\s+/gim, " ");
  return lastText;
}
