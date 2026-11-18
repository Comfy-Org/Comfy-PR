import { prNumberFromMainCommit } from "./prNumberFromMainCommit";

/**
 * Pick the main PRs to label from commits behind a release branch's fork point.
 *
 * `commits` is newest first (as `listCommits` returns them), each with its
 * message and parent count (two or more for a classic merge commit). A PR that is
 * already labeled is skipped, a PR seen twice is returned once with its newest
 * subject, and at most `limit` PRs are returned so one run stays within the
 * token budget; the rest are picked up by the next run.
 */
export function branchCutPRsToLabel(
  commits: ReadonlyArray<{ message: string; parents: number }>,
  alreadyLabeled: ReadonlySet<number>,
  limit: number,
): Array<{ prNumber: number; subject: string }> {
  const picked = new Map<number, string>();
  for (const { message, parents } of commits) {
    if (picked.size >= limit) break;
    const prNumber = prNumberFromMainCommit(message, parents > 1);
    if (prNumber === null || alreadyLabeled.has(prNumber) || picked.has(prNumber)) continue;
    picked.set(prNumber, message.split("\n", 1)[0]);
  }
  return [...picked].map(([prNumber, subject]) => ({ prNumber, subject }));
}
