export function shouldCheckRelease(release: { draft: boolean; prerelease: boolean }): boolean {
  return !release.draft && !release.prerelease;
}
