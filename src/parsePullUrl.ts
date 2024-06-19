export function parsePullUrl(issueUrl: string) {
  const [owner, repo, strNumber] = issueUrl
    .match(/^https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/(?:pull)\/(\d+)$/)!
    .slice(1);
  return { owner, repo, pull_number: Number(strNumber) };
}
