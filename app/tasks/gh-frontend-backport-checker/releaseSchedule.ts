/**
 * Order releases for one checker run: least recently checked first (never checked counts as 0),
 * ties newest first by `created_at`, so a run cut short by the time budget resumes where it stopped.
 */
export function orderReleasesForRun<T extends { html_url: string; created_at: string }>(
  releases: readonly T[],
  lastCheckedAt: ReadonlyMap<string, number>,
): T[] {
  const checkedAt = (r: T) => lastCheckedAt.get(r.html_url) ?? 0;
  return [...releases].sort(
    (a, b) => checkedAt(a) - checkedAt(b) || +new Date(b.created_at) - +new Date(a.created_at),
  );
}
