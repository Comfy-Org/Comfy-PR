import DIE from "@snomiao/die";

/**
 * Parse pull or issue url, get issue_number
 */
export function parseIssueUrl(issueUrl: string) {
  const m =
    issueUrl.match(
      /^https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/(?:pull|issues)\/(\d+)(?:\/(?:files)?)?(?:#.*)?$/,
    ) || DIE(`Invalid issue URL: ${issueUrl}`);
  const [owner, repo, strNumber] = m.slice(1);
  if (!owner || !repo || !strNumber) {
    throw new Error(`Invalid issue URL: ${issueUrl}`);
  }
  return { owner, repo, issue_number: Number(strNumber) };
}

export function stringifyIssueUrl({ owner, repo, issue_number }: ReturnType<typeof parseIssueUrl>) {
  return `https://github.com/${owner}/${repo}/issues/${issue_number}`;
}
