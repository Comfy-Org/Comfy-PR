import DIE from "@snomiao/die";
import { match } from "ts-pattern";
import { user } from ".";
import { CNRepos } from "./CNRepos";
import { $fresh } from "./db";
import { $flatten } from "./db/$flatten";
import { gh } from "./gh";
import { parseUrlRepoOwner, stringifyOwnerRepo } from "./parseOwnerRepo";
import { $OK } from "./utils/Task";

export async function updateCNRepoPullsDashboard() {
  if (user.login !== "snomiao") return [];
  const dashBoardIssue = process.env.DASHBOARD_ISSUE_URL || DIE("DASHBOARD_ISSUE_URL not found");
  const dashBoardRepo = dashBoardIssue.replace(/\/issues\/\d+$/, "");
  const dashBoardIssueNumber = Number(dashBoardIssue.match(/\/issues\/(\d+)$/)?.[1] || DIE("Issue number not found"));
  // update dashboard issue if run by @snomiao
  const repos = await CNRepos.find($flatten({ crPulls: { mtime: $fresh("1d") } })).toArray();
  const result = repos
    .map((repo) => {
      const crPulls = match(repo.crPulls)
        .with($OK, ({ data }) => data)
        .otherwise(() => DIE("CR Pulls not found"));
      const repoName = stringifyOwnerRepo(parseUrlRepoOwner(repo.repository));
      const body = crPulls
        .filter((e) => e.pull.state !== "closed")
        .map((e) => {
          const date = new Date(e.pull.created_at).toISOString().slice(0, 10);
          const state = e.pull.state.toUpperCase();
          return {
            href: e.pull.html_url,
            name: `PR ${date} ${state}: ${repoName} #${e.type}`,
          };
        })
        .map(({ href, name }) => `- [${name}](${href})`)
        .toSorted()
        .join("\n");
      return body;
    })
    .filter(Boolean)
    .join("\n");
  const body = result;

  return [
    await gh.issues.update({
      ...parseUrlRepoOwner(dashBoardRepo),
      issue_number: dashBoardIssueNumber,
      body,
    }),
  ];
}
