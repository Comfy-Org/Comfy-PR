/**
 * Read the PR number from a commit on `main`.
 *
 * A squash merge has one parent and its subject ends with `(#NNNN)`. A classic
 * merge commit has two parents and reads `Merge pull request #NNNN from ...`.
 * The caller says which it is (from the commit's parent count), because either
 * subject can contain the other's pattern: a branch name may end in `(#NNN)`,
 * and a squash subject may start with "Merge pull request #NNN".
 *
 * Anything else (a direct push, a bot commit without a PR) names no PR, and so
 * does a number that cannot be a PR (zero, or too large to hold exactly).
 */
export function prNumberFromMainCommit(message: string, isMergeCommit = false): number | null {
  const subject = message.split("\n", 1)[0].trim();
  const digits = isMergeCommit
    ? subject.match(/^Merge pull request #(\d+) /)?.[1]
    : subject.match(/\(#(\d+)\)$/)?.[1];
  if (digits === undefined) return null;
  const prNumber = Number(digits);
  return Number.isSafeInteger(prNumber) && prNumber > 0 ? prNumber : null;
}
