/**
 * Order releases for one checker run: the newest release first (its report matters most),
 * then the rest least-recently-checked first, so a run cut short by the time budget
 * picks up the skipped releases next time. `releases` must be newest first; a release
 * that was never checked counts as checked at time 0.
 */
export function orderReleasesForRun<T extends { html_url: string }>(
  releases: readonly T[],
  lastCheckedAt: ReadonlyMap<string, number>,
): T[] {
  if (releases.length <= 1) return [...releases];
  const [newest, ...rest] = releases;
  const checkedAt = (r: T) => lastCheckedAt.get(r.html_url) ?? 0;
  // Array.prototype.sort is stable, so ties keep newest-first order.
  return [newest, ...rest.sort((a, b) => checkedAt(a) - checkedAt(b))];
}
