export function parseIssueUrl(issueUrl: string) {
    const [owner, repo, strNumber] = issueUrl
        .match(/^https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/(?:pull|issues)\/(\d+)$/)!
        .slice(1);
    return { owner, repo, issue_number: Number(strNumber) };
}
