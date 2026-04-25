/**
 * Extract the original (main-branch) PR number that a release-branch PR
 * corresponds to. Supports three styles:
 *
 *   1. Standard backport-bot body:         "Backport of #1234 ..."
 *   2. Title-style backport:               "[backport core/1.41] feat: ... (#1234)"
 *   3. Bracket-prefixed branch:            "[cloud/1.41] fix: ... (#1234)"
 *
 * Returns null when the PR has no detectable reference to an original PR —
 * release-cut commits, branch-only fixups, version bumps, etc.
 *
 * Kept dependency-free so unit tests can import it without pulling in the
 * MongoDB client or GitHub API wrapper.
 */
export function extractOriginalPRNumber(
  body: string | null,
  title: string | null = null,
): number | null {
  const bodyMatch = body?.match(/Backport of #(\d+)/);
  if (bodyMatch) return parseInt(bodyMatch[1], 10);

  const titleMatch = title?.match(/^\[backport [^\]]+\].*\(#(\d+)\)\s*$/i);
  if (titleMatch) return parseInt(titleMatch[1], 10);

  const branchPrefixMatch = title?.match(/^\[[a-z]+\/[\d.]+\].*\(#(\d+)\)\s*$/i);
  if (branchPrefixMatch) return parseInt(branchPrefixMatch[1], 10);

  return null;
}
