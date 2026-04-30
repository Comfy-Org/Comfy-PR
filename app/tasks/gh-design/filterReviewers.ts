/**
 * Filter the reviewer list for a PR: excludes the PR author and
 * anyone who has already been requested.
 */
export function filterReviewers(
  allReviewers: string[],
  prAuthor: string,
  alreadyRequested?: string[],
): { requestReviewers: string[]; newReviewers: string[] } {
  const requestReviewers = allReviewers.filter((e) => e !== prAuthor);
  const newReviewers = requestReviewers.filter((e) => !alreadyRequested?.includes(e));
  return { requestReviewers, newReviewers };
}
