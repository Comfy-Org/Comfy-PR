import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { ghUser } from "@/src/ghUser";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import console from "console";
import isCI from "is-ci";
import sflow, { pageFlow } from "sflow";
import { match } from "ts-pattern";

// ref: https://www.notion.so/drip-art/Make-a-Github-bot-to-detect-that-a-Github-Hub-is-bounty-milestone-and-comment-on-there-to-link-to--2016d73d365080e7b7dececaa4f75d74

// outdated
const mailtoLink =
  "mailto:bounty@comfy.org?subject=I%20can%20help%20%5BYOUR_TASK%5D&body=I%20can%20help%20with%20YOUR_TASK,%0A%0AMy%20approach%20is%20...%0A%0AMy%20timeline%20is%20...";
const outdatedBountyMessage = `This Issues has been set to be bounty, here is the link on how to sign up for this bounty: https://comfyorg.notion.site/ComfyUI-Bounty-Tasks-1fb6d73d36508064af76d05b3f35665f or [click here to sign up](${mailtoLink})`;

const getMailtoLink = ({ subject, body }: { subject: string; body: string }) =>
  `mailto:bounty@comfy.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const getBountyMessage = (issue_title: string, issueUrl: string) =>
  `This Issues has been set to be bounty, here is the link on how to sign up for this bounty: https://comfyorg.notion.site/ComfyUI-Bounty-Tasks-1fb6d73d36508064af76d05b3f35665f or [click here to sign up](${getMailtoLink(
    {
      subject: `I can help [${issue_title}]`,
      body: `I can help with ${issue_title}\n issue_url: ${issueUrl}\n\nMy approach is ...\n\nMy timeline is ...`,
    },
  )})`;

const milestoneUrls = [
  "https://github.com/Comfy-Org/ComfyUI_frontend/milestone/1",
  "https://github.com/Comfy-Org/desktop/milestone/1",
];
export const GithubBountyTask = db.collection<{
  issueUrl: string; // the Bounty issue url
  status?: "error" | "pending" | "done-2025-05-29";
}>("GithubBountyTask");

if (import.meta.main) {
  await runGithubBountyTask();
  if (isCI) {
    await db.close();
    process.exit(0); // exit if running in CI
  }
}

export default async function runGithubBountyTask() {
  // 1. list all issues in milestone
  // 2. for each issues, add 'Bounty' label if not exists
  // 3. leave comment on the issue with bounty message if not exists
  // 4. done

  // for debug
  const isDryRun = !!process.env.DRY;
  if (isDryRun) {
    console.log("Running in DRY mode, no changes will be made.");
  } else {
    console.log("Running in LIVE mode, changes will be made.");
  }

  await sflow(milestoneUrls)
    .map(async (milestoneUrl) => {
      const milestoneNumber = parseMilestoneUrl(milestoneUrl).milestone_number;
      return pageFlow(1, async (page) => {
        const per_page = 100;
        const { data: issues } = await gh.issues.listForRepo({
          ...parseMilestoneUrl(milestoneUrl),
          page,
          per_page,
          milestone: String(milestoneNumber),
        });
        console.log(`Found ${issues.length} issues in milestone ${milestoneUrl}`);
        return { data: issues, next: issues.length >= per_page ? page + 1 : undefined };
      })
        .filter((e) => e.length)
        .flat();
    })
    .confluenceByConcat()
    .forEach(async (issue) => {
      const task = await GithubBountyTask.findOne({ issueUrl: issue.html_url });
      if (task?.status === "done-2025-05-29") return;

      console.log("processing " + issue.html_url);
      // add label
      if (
        !issue.labels.some(
          (l) =>
            match(l)
              .when(
                (e) => typeof e === "string",
                (e) => e,
              )
              .otherwise((e) => e.name) === "Bounty",
        )
      ) {
        console.log(`Adding label 'Bounty' to issue ${issue.html_url}`);
        !isDryRun &&
          (await gh.issues.addLabels({
            ...parseIssueUrl(issue.html_url),
            labels: ["Bounty"],
          }));
      }

      // add comment
      const comments = await gh.issues.listComments(parseIssueUrl(issue.html_url));
      const bountyMessage = getBountyMessage(issue.title, issue.html_url);
      const outdatedComment = comments.data.find((c) => c.body === outdatedBountyMessage);
      if (outdatedComment) {
        if (outdatedComment.user?.login === (await ghUser()).login) {
          console.log(`Updating comment in issue ${issue.html_url}`);
          !isDryRun &&
            (await gh.issues.updateComment({
              ...parseIssueUrl(issue.html_url),
              comment_id: outdatedComment.id,
              body: bountyMessage,
            }));
        }
      } else if (!comments.data.some((c) => c.body === bountyMessage)) {
        console.log(`Adding comment to issue ${issue.html_url}`);
        !isDryRun &&
          (await gh.issues.createComment({
            ...parseIssueUrl(issue.html_url),
            body: bountyMessage,
          }));
      }
      console.log(`Issue ${issue.html_url} processed successfully.`);

      // mark this issue as done in db.
      !isDryRun &&
        (await GithubBountyTask.updateOne(
          { issueUrl: issue.html_url },
          { $set: { status: "done-2025-05-29" } },
          { upsert: true },
        ));
    })
    .run();
  console.log("All issues processed successfully.");
}

export function parseMilestoneUrl(url: string) {
  const [owner, repo, strNumber] = url
    .match(/^https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/(?:milestone)\/(\d+)$/)!
    .slice(1);
  return { owner, repo, milestone_number: Number(strNumber) };
}
