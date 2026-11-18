/**
 * Read the PR number from a commit on `main`.
 *
 * ComfyUI_frontend squash-merges, so the subject ends with `(#NNNN)`. A
 * classic merge commit reads `Merge pull request #NNNN from ...`. Anything
 * else (a direct push, a bot commit without a PR) names no PR, and so does a
 * number that cannot be a PR (zero, or too large to hold exactly).
 */
export function prNumberFromMainCommit(message: string): number | null {
  const subject = message.split("\n", 1)[0].trim();
  // The merge prefix first: a branch name may itself end in "(#NNN)".
  const digits =
    subject.match(/^Merge pull request #(\d+) /)?.[1] ?? subject.match(/\(#(\d+)\)$/)?.[1];
  if (digits === undefined) return null;
  const prNumber = Number(digits);
  return Number.isSafeInteger(prNumber) && prNumber > 0 ? prNumber : null;
}
