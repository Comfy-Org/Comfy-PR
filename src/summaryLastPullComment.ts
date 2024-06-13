import { type GithubPullComment } from "./fetchRepoPRs";

export function summaryLastPullComment(comments: GithubPullComment[]) {
  // assume ascending order
  const last = comments.toReversed()[0];
  const lastText =
    (last ?? "") &&
    "@" + last.user!.name + ":" + last.body!.replace(/\s+/gim, " ");
  return lastText;
}
