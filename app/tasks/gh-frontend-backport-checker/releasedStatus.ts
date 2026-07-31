import type { BackportStatus } from "./index";

/**
 * A merged backport is not a shipped fix.
 *
 * #14065 merged onto core/1.47 nineteen hours after v1.47.10 was tagged. This
 * checker reported it "completed", ComfyUI pinned v1.47.10, and the fix reached
 * nobody for a week while five users reported the bug it had already fixed.
 * Tracking only "did it land on the branch" is what made that invisible.
 */

/**
 * Given `compareCommits({ base: tag, head: commit })`, whether the tag already
 * contains the commit.
 */
export function isCommitInTag(comparisonStatus: string): boolean {
  return comparisonStatus === "identical" || comparisonStatus === "behind";
}

/**
 * Whether a tag belongs to a release line. Exact match or a dot-delimited
 * prefix only: a bare startsWith lets `core/1.4` swallow `v1.40.0`.
 */
export function isTagOnLine(tagName: string, branch: string): boolean {
  const branchVersion = branch.replace(/^(core|cloud)\//, "");
  const tagVersion = tagName.replace(/^(cloud\/)?v/, "");
  return tagVersion === branchVersion || tagVersion.startsWith(`${branchVersion}.`);
}

export function resolveShippedStatus({
  backportStatus,
  releasedInTag,
}: {
  backportStatus: BackportStatus;
  releasedInTag: string | null;
}): BackportStatus {
  if (backportStatus !== "completed") return backportStatus;
  return releasedInTag ? "completed" : "merged-unreleased";
}
