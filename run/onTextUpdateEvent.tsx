import { type GH } from "@/lib/github";
import { match } from "ts-pattern";

export function onIssueComment(
  payload:
    | GH["webhook-issue-comment-created"]
    | GH["webhook-issue-comment-edited"]
    | GH["webhook-issue-comment-deleted"],
): void {
  const timestamp = new Date().toISOString();
  const repoName = `${payload.repository.owner.login}/${payload.repository.name}`;
  const { action, issue, comment, sender } = payload;
  console.log(JSON.stringify({ payload }));
  const issueNumber = issue.number;
  const username = sender.login;
  const isPR = !!issue.pull_request;

  match(action)
    .with("created", () => {
      const type = isPR ? "PR" : "ISSUE";
      console.log(
        `[${timestamp}] 💬 NEW ${type} COMMENT: ${repoName}#${issueNumber} by ${username}`,
      );

      // Log comment details if available
      if (comment.body) {
        const preview =
          comment.body.length > 100 ? comment.body.substring(0, 100) + "..." : comment.body;
        console.log(`[${timestamp}] 📝 Comment preview: "${preview.trim()}"`);
      }
    })
    .with("edited", () => {
      const type = isPR ? "PR" : "ISSUE";
      console.log(
        `[${timestamp}] ✏️  ${type} COMMENT EDITED: ${repoName}#${issueNumber} by ${username}`,
      );
      // Log comment details if available
      if (comment.body) {
        const preview =
          comment.body.length > 100 ? comment.body.substring(0, 100) + "..." : comment.body;
        console.log(`[${timestamp}] 📝 Comment preview: "${preview.trim()}"`);
      }
    })
    .with("deleted", () => {
      const type = isPR ? "PR" : "ISSUE";
      console.log(
        `[${timestamp}] 🗑️  ${type} COMMENT DELETED: ${repoName}#${issueNumber} by ${username}`,
      );
    })
    .exhaustive();
}
export function onIssue(
  payload: GH["webhook-issues-opened"] | GH["webhook-issues-edited"] | GH["webhook-issues-deleted"],
): void {
  const timestamp = new Date().toISOString();
  const repoName = `${payload.repository.owner.login}/${payload.repository.name}`;
  const { action, issue, sender } = payload;

  const issueNumber = issue.number;
  const username = sender.login;

  match(action)
    .with("opened", () => {
      console.log(`[${timestamp}] 🆕 NEW ISSUE: ${repoName}#${issueNumber} by ${username}`);
      if (issue.title) {
        console.log(`[${timestamp}] 📋 Title: "${issue.title}"`);
      }
    })
    .with("edited", () => {
      console.log(`[${timestamp}] ✏️  ISSUE EDITED: ${repoName}#${issueNumber} by ${username}`);
    })
    .with("deleted", () => {
      console.log(`[${timestamp}] 🗑️  ISSUE DELETED: ${repoName}#${issueNumber} by ${username}`);
    })
    .exhaustive();
}
