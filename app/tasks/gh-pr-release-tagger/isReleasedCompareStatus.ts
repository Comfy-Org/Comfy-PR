/**
 * Decide whether a merge commit has been deployed, given the status field
 * returned by GitHub's `repos.compareCommits` API.
 *
 * The call is made with base = deployedRef and head = merge_commit_sha, so:
 *
 *   - "identical" — the merge commit IS the deployed ref (released).
 *   - "behind"    — the head is behind the base, i.e. the merge commit is
 *                   an ancestor of the deployed ref (released).
 *   - "ahead"     — the merge commit is ahead of the deployed ref
 *                   (not yet released).
 *   - "diverged"  — the two commits share history but neither is an
 *                   ancestor of the other (not released).
 *
 * A dedicated helper keeps the inclusion rule pinned down so a subtle
 * reversal (e.g. swapping base/head in the call site) gets caught by the
 * unit test instead of silently mislabeling PRs in production.
 */
export type CompareCommitsStatus = "identical" | "behind" | "ahead" | "diverged";

export function isReleasedCompareStatus(status: string): boolean {
  return status === "behind" || status === "identical";
}
