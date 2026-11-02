/**
 * Pick the `main` PRs that could have reached a release branch through its
 * branch cut rather than through a backport.
 *
 * A release branch forks from `main`. Every PR merged to `main` before that
 * fork point is on the branch with no backport PR, so the backport walk in
 * `processTarget` can never see it. These candidates still need the same
 * compare against the deployed ref: the fork point alone does not prove the
 * deployed ref contains the commit (a PR merged after the fork is excluded
 * here, and the compare is what confirms inclusion for the rest).
 */
export type MainPRLike = {
  number: number;
  merged_at: string | null;
  merge_commit_sha: string | null;
};

export function branchCutCandidates<T extends MainPRLike>(
  mainPRs: T[],
  forkPointDate: Date,
  alreadyLabeled: Set<number>,
): T[] {
  return mainPRs.filter(
    (pr) =>
      pr.merged_at !== null &&
      pr.merge_commit_sha !== null &&
      new Date(pr.merged_at).getTime() <= forkPointDate.getTime() &&
      !alreadyLabeled.has(pr.number),
  );
}
