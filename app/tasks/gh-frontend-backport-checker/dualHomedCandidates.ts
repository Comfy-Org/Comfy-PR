/**
 * Narrow the branches a commit from `releaseTag` could be dual-homed on.
 *
 * A commit that ships in release 1.M can only sit, with the same SHA, on a
 * branch cut from `main` after it landed. A 1.M.0 bump cuts `core/1.(M-1)`
 * and `cloud/1.(M-1)` from the commit right before the bump, so the oldest
 * branch that can hold one of its commits is minor M-1. Older branches were
 * cut before the commit existed, so checking them is a wasted compare call;
 * with ~90 `core/1.*`/`cloud/1.*` branches that waste is what ran the
 * checker past its 10-minute CI timeout.
 *
 * Branches or tags whose minor cannot be parsed are kept, so this never
 * hides a match it cannot reason about.
 */
export function dualHomedCandidateBranches(branches: readonly string[], releaseTag: string): string[] {
  const releaseMinor = releaseTag.match(/^v?\d+\.(\d+)/)?.[1];
  if (releaseMinor === undefined) return [...branches];
  const oldest = Number(releaseMinor) - 1;
  return branches.filter((branch) => {
    const branchMinor = branch.match(/^[^/]+\/\d+\.(\d+)/)?.[1];
    return branchMinor === undefined || Number(branchMinor) >= oldest;
  });
}
