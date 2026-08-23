export type ReleaseComparisonCandidate = {
  prerelease: boolean;
  bodyUrls: readonly string[];
};

export function getReleaseComparison(
  candidate: ReleaseComparisonCandidate,
  repositoryUrl: string,
): { compareLink: string } | null {
  const compareLink = candidate.bodyUrls.find((url) => url.includes(`${repositoryUrl}/compare/`));
  return compareLink ? { compareLink } : null;
}
