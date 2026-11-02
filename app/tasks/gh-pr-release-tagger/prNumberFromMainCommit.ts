/**
 * Read the PR number from a commit on `main`.
 *
 * ComfyUI_frontend squash-merges, so the subject ends with `(#NNNN)`. A
 * classic merge commit reads `Merge pull request #NNNN from ...`. Anything
 * else (a direct push, a bot commit without a PR) names no PR.
 */
export function prNumberFromMainCommit(message: string): number | null {
  const subject = message.split("\n", 1)[0].trim();
  const squash = subject.match(/\(#(\d+)\)$/);
  if (squash) return Number(squash[1]);
  const merge = subject.match(/^Merge pull request #(\d+) /);
  if (merge) return Number(merge[1]);
  return null;
}
