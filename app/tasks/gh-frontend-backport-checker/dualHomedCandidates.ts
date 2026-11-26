/** Keep branches whose minor is >= the release minor - 1; branches or tags it cannot parse are kept. */
export function dualHomedCandidateBranches(branches: readonly string[], releaseTag: string): string[] {
  const releaseMinor = releaseTag.match(/^v?\d+\.(\d+)/)?.[1];
  if (releaseMinor === undefined) return [...branches];
  const oldest = Number(releaseMinor) - 1;
  return branches.filter((branch) => {
    const branchMinor = branch.match(/^[^/]+\/\d+\.(\d+)/)?.[1];
    return branchMinor === undefined || Number(branchMinor) >= oldest;
  });
}
