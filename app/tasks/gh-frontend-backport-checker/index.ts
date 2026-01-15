#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow from "sflow";
import { upsertSlackMessage } from "../gh-desktop-release-notification/upsertSlackMessage";
import urlRegexSafe from "url-regex-safe";
import { ghc } from "@/lib/github/githubCached";
import { logger } from "@/src/logger";
import { map } from "zod";
import prettier from "prettier";
import { slackBot } from "@/lib/slack";
import { ghPageFlow } from "@/src/ghPageFlow";
import { match as tsmatch } from "ts-pattern";
/**
 * GitHub Frontend Backport Checker Task
 *
 * Workflow:
 * 1. Monitor ComfyUI_frontend releases
 * 2. Identify bugfix commits (keywords: fix, bugfix, hotfix, patch, bug)
 * 3. For each bugfix, find the associated PR
 * 4. Check PR labels for backport indicators (core/1.**, cloud/1.**)
 * 5. Check PR comments for backport mentions
 * 6. Track status and send Slack summary (to channel #frontend-releases)
 *
 * Slack Message Format:
 *
 * @example
 * ```md
 * ## Release v${version} Backport Status:
 *
 * | Commit | From | To | Status | Notes | Actions |
 * | ------ | ------------------------ | ---- | -- | ------ | ----- | ------- |
 * | ${commitMessage} | ${from} | ${to} | ${status} | ${notes} | ${actions} |
 * ```
 */

const config = {
  repo: "https://github.com/Comfy-Org/ComfyUI_frontend",
  slackChannel: "frontend",
  reBugfixPatterns: /\b(fix|bugfix|hotfix|patch|bug)\b/i,
  reBackportTargets: /^(core|cloud)\/1\..*$/,
  backportLabels: ["needs-backport"],
  processSince: new Date("2025-01-01T00:00:00Z").toISOString(),
  maxReleasesToCheck: 5,
};

export type BackportStatus = "not-needed" | "needed" | "in-progress" | "completed" | "unknown";

export type GithubFrontendBackportCheckerTask = {
  releaseUrl: string;
  releaseTag: string;
  releaseCreatedAt: Date;
  commitSha: string;
  commitMessage: string;
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;
  prLabels?: string[];
  backportStatus: BackportStatus; // overall status, derived from backportTargetStatus, calculated by backport targets (core/1.**, cloud/1.**)
  backportStatusRaw: BackportStatus; // raw status from bugfix PR analysis, before checking backport targets status
  backportLabels: string[];
  backportMentioned: boolean;
  backportTargetStatus: Array<{
    status: BackportStatus;
    branch: string;
  }>;
  checkedAt: Date;
  slackMessage?: {
    text: string;
    channel: string;
    url?: string;
  };
};

export const GithubFrontendBackportCheckerTask = db.collection<GithubFrontendBackportCheckerTask>(
  "GithubFrontendBackportCheckerTask",
);

const save = async (task: { commitSha: string } & Partial<GithubFrontendBackportCheckerTask>) =>
  (await GithubFrontendBackportCheckerTask.findOneAndUpdate(
    { commitSha: task.commitSha },
    { $set: task },
    { upsert: true, returnDocument: "after" },
  )) || DIE("never");

if (import.meta.main) {
  await runGithubFrontendBackportCheckerTask();
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

export default async function runGithubFrontendBackportCheckerTask() {
  await GithubFrontendBackportCheckerTask.createIndex({ commitSha: 1 }, { unique: true });
  await GithubFrontendBackportCheckerTask.createIndex({ releaseTag: 1 });
  await GithubFrontendBackportCheckerTask.createIndex({ checkedAt: 1 });

  // scans backport targets (core/1.**, cloud/1.**)
  const availableBackportTargetBranches = await ghPageFlow(ghc.repos.listBranches)(
    parseGithubRepoUrl(config.repo),
  )
    .filter((branch) => branch.name.match(config.reBackportTargets))
    .map((branch) => branch.name)
    .toArray();
  logger.info(`Backport target branches: ${availableBackportTargetBranches.join(", ")}`);

  // throw 'check'

  // Fetch recent releases
  const releases = await ghc.repos
    .listReleases({ ...parseGithubRepoUrl(config.repo), per_page: config.maxReleasesToCheck })
    .then((e) => e.data);

  console.log(`Found ${releases.length} recent releases to check`);

  const allBugfixTasks: GithubFrontendBackportCheckerTask[] = [];

  // Process each release
  await sflow(releases)
    .filter((release) => +new Date(release.created_at) >= +new Date(config.processSince))
    .map(async (release) => {
      console.log(`\nProcessing release: ${release.tag_name}`);
      console.log(import.meta.path);
      // console.log(JSON.stringify(release.body));
      // 1. find full changelog link in release body, e.g. https://github.com/Comfy-Org/ComfyUI_frontend/compare/v1.38.0...v1.38.1
      const urls =
        release.body
          ?.matchAll(urlRegexSafe())
          .map((g) => g[0])
          .toArray() || [];
      const compareLink =
        urls.find((u) => u.includes(`https://github.com/Comfy-Org/ComfyUI_frontend/compare/`)) ||
        DIE("No compare link found in release body, do we have a proper changelog?");
      logger.info(`  Found compare link: ${compareLink}`);

      // 2. get commits from the compare link API
      const { owner, repo, base, head } =
        compareLink.match(
          /github\.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)\/compare\/(?<base>\S+)\.\.\.(?<head>\S+)/,
        )?.groups || DIE(`Failed to parse compare link: ${compareLink}`);
      logger.info(`  Comparing to head: ${head}`);
      // const compareApiUrl = compareLink
      const compareResult = await ghc.repos
        .compareCommits({ owner, repo, base, head })
        .then((e) => e.data.commits);
      logger.info(`  Found ${compareResult.length} commits in release`);

      // collect already backported commits
      await sflow(compareResult)
        .filter((commit) => /\[backport .*?\]/i.test(commit.commit.message.split("\n")[0]))
        .map(async (commit) => {
          const commitSha = commit.sha;
          const commitMessage = commit.commit.message.split("\n")[0]; // First line only

          logger.debug(
            `    Found already backported commit: ${commitSha.substring(0, 7)} - ${commitMessage}`,
          );
        })
        .run();

      // 3. process each commits (need to backport)
      const bugFixPRs = await sflow(compareResult)
        // filter bugfix commits
        .filter((commit) => config.reBugfixPatterns.test(commit.commit.message.split("\n")[0]))
        // filter out [backport .*] commits
        .filter((commit) => !/\[backport .*?\]/i.test(commit.commit.message.split("\n")[0]))
        .map(async (commit) => {
          const commitSha = commit.sha;
          const commitMessage = commit.commit.message.split("\n")[0]; // First line only

          logger.info(`    Checking commit: ${commitSha.substring(0, 7)} - ${commitMessage}`);

          // Find associated PR(s)
          const prs = await ghc.repos
            .listPullRequestsAssociatedWithCommit({
              owner,
              repo,
              commit_sha: commitSha,
            })
            .then((e) => e.data);
          logger.info(`      Found ${prs.length} associated PR(s)`); // usually have only one
          return sflow(prs)
            .map(async (pr) => {
              const prNumber = pr.number;
              const prUrl = pr.html_url;
              const prTitle = pr.title;

              logger.info(`      Processing PR #${prNumber}: ${prTitle}`);

              // Check labels
              const labels = pr.labels.map((l) => (typeof l === "string" ? l : l.name));
              const backportLabels = labels.filter((l) => config.reBackportTargets.test(l));

              // Check PR body and comments for backport mentions
              const prDetails = await ghc.pulls.get({ owner, repo, pull_number: prNumber });
              const bodyText = (prDetails.data.body || "").toLowerCase();

              const comments = await ghc.issues
                .listComments({
                  owner,
                  repo,
                  issue_number: prNumber,
                })
                .then((e) => e.data);

              const commentTexts = comments
                // no bot msgs
                .filter((c) => !c.user?.login?.match(/\bbot$|\[bot\]$/))
                .map((c) => c.body?.toLowerCase() || "")
                .join(" ");

              const backportMentioned =
                /backport/i.test(bodyText) ||
                /backport/i.test(commentTexts) ||
                /stable/i.test(bodyText) ||
                /stable/i.test(commentTexts);

              // Determine status
              let backportStatusRaw: BackportStatus = "unknown";
              if (backportLabels.length > 0) {
                if (backportLabels.some((l) => l.toLowerCase().includes("completed"))) {
                  backportStatusRaw = "completed";
                } else if (backportLabels.some((l) => l.toLowerCase().includes("in-progress"))) {
                  backportStatusRaw = "in-progress";
                } else if (backportLabels.some((l) => l.toLowerCase().includes("needs"))) {
                  backportStatusRaw = "needed";
                } else {
                  backportStatusRaw = "needed";
                }
              } else if (backportMentioned) {
                backportStatusRaw = "needed";
              } else {
                backportStatusRaw = "unknown";
              }

              logger.info(
                `        PR #${prNumber} backport status: ${backportStatusRaw} (labels: ${backportLabels.join(
                  ", ",
                )})`,
              );
              // check each backport target branch status
              const backportTargetStatus = await sflow(availableBackportTargetBranches)
                // only when this pr is needed to backport
                .filter((e) => backportStatusRaw === "needed")
                // only when this branch is in PR labels
                .filter((branchName) =>
                  labels.some((l) => l.toLowerCase().includes(branchName.toLowerCase())),
                )
                // now check if the commit is in the branch
                .map(async (branchName) => {
                  // let status: BackportStatus = "unknown";
                  // check if the commit is in the branch
                  const comparing = await ghc.repos
                    .compareCommits({
                      owner,
                      repo,
                      base: branchName,
                      head: commitSha,
                    })
                    .then((e) => e.data);
                  // logger.info(JSON.stringify(comparing));
                  const status = await tsmatch(comparing.status)
                    .with("ahead", () => "needed") // not yet backported
                    .with("identical", () => "completed") // backport done
                    .with("behind", () => "completed") // backport done

                    // diverged means we need to determine backport PR status:
                    //    when PR not exists, we need to backport
                    //    when PR exists, merged: already backport
                    //    when PR exists, open:   in progress
                    .with("diverged", async () => {
                      // search the backport pr and check its status
                      // e.g. backport-7974-to-cloud-1.36, this branch name is autogenerated by ci
                      const backportBranch = `backport-${prNumber}-to-${branchName.replaceAll("/", "-")}`;
                      const backportPRs = await ghPageFlow(ghc.pulls.list)({
                        owner,
                        repo,
                        head: backportBranch,
                        base: branchName,
                      }).toArray();
                      logger.warn(backportPRs);
                      // if pr is merged
                      if (backportPRs.filter((e) => e.merged_at).length) return "completed"; // some of backport prs are merged
                      // backportPRs[0].closed_at
                      // if pr is merged
                      return comparing.status;
                    })
                    .otherwise(() => comparing.status);

                  // if (isInBranch) {
                  //   status = "completed";
                  // } else {
                  //   status = "needed";
                  // }
                  logger.info(`          Backport target branch ${branchName} status: ${status}`);
                  return { branch: branchName, status };
                })
                .toArray();
                
              const backportStatus =
                backportTargetStatus.length &&
                backportTargetStatus.every((t) => t.status === "completed")
                  ? "completed"
                  : backportTargetStatus.some((t) => t.status === "in-progress")
                    ? "in-progress"
                    : backportTargetStatus.some((t) => t.status === "needed")
                      ? "needed"
                      : "unknown";
              // Save to database
              const task = await save({
                releaseUrl: release.html_url,
                releaseTag: release.tag_name,
                releaseCreatedAt: new Date(release.created_at),
                commitSha,
                commitMessage,
                prNumber,
                prUrl,
                prTitle,
                prLabels: labels,
                backportStatus,
                backportStatusRaw,
                backportLabels,
                backportTargetStatus,
                backportMentioned,
                checkedAt: new Date(),
              });

              allBugfixTasks.push(task);
              return task;
            })
            .toArray();
        })
        .flat()
        .toArray();

      // - generate report based on commits
      const report = `Release ${release.tag_name} Backport Status:

| Commit | Targets | Status | Notes | Actions |
| ------ | ------------------------ | ---- | -- | ------ | ----- | ------- |
${allBugfixTasks
  .map((bf) => {
    const notes = bf.backportLabels.length
      ? `Labels: ${bf.backportLabels.join(", ")}`
      : bf.backportMentioned
        ? "Mentioned"
        : "";
    const actions =
      bf.backportStatus === "needed"
        ? `Please backport to stable branch.`
        : bf.backportStatus === "in-progress"
          ? `Backport in progress.`
          : bf.backportStatus === "completed"
            ? `Backport completed.`
            : "";
    const targetsStatuses = bf.backportTargetStatus
      .map((ts) => `${ts.branch}: ${ts.status}`)
      .join("<br> ");
    return `| [${bf.commitMessage}](${bf.prUrl}) | ${targetsStatuses}  | ${bf.backportStatus === "unknown" ? "" : bf.backportStatus} | ${notes} | ${actions} |`;
  })
  .join("\n")}
`;

      // slackCached.users.list({}).thens
      logger.info(await prettier.format(report, { parser: "markdown" }));
    })
    // .map(async (release) => {
    //   console.log(`\nProcessing release: ${release.tag_name}`);

    //   // Get commits for this release
    //   const comparison = await gh.repos
    //     .compareCommitsWithBasehead({
    //       owner,
    //       repo,
    //       basehead: `${release.target_commitish}...${release.tag_name}`,
    //     })
    //     .then((e) => e.data);

    //   const commits = comparison.commits || [];
    //   console.log(`  Found ${commits.length} commits in release`);

    //   // Filter bugfix commits
    //   const bugfixCommits = commits.filter((commit) =>
    //     config.bugfixPatterns.test(commit.commit.message),
    //   );

    //   console.log(`  Found ${bugfixCommits.length} bugfix commits`);

    //   // Process each bugfix commit
    //   await sflow(bugfixCommits)
    //     .map(async (commit) => {
    //       const commitSha = commit.sha;
    //       const commitMessage = commit.commit.message.split("\n")[0]; // First line only

    //       console.log(`    Checking commit: ${commitSha.substring(0, 7)} - ${commitMessage}`);

    //       // Find associated PR(s)
    //       const prs = await gh.repos
    //         .listPullRequestsAssociatedWithCommit({
    //           owner,
    //           repo,
    //           commit_sha: commitSha,
    //         })
    //         .then((e) => e.data);

    //       let backportStatus: BackportStatus = "unknown";
    //       let backportLabels: string[] = [];
    //       let backportMentioned = false;
    //       let prNumber: number | undefined;
    //       let prUrl: string | undefined;
    //       let prTitle: string | undefined;

    //       if (prs.length > 0) {
    //         // Use the first PR (typically the original PR)
    //         const pr = prs[0];
    //         prNumber = pr.number;
    //         prUrl = pr.html_url;
    //         prTitle = pr.title;

    //         // Check labels
    //         const labels = pr.labels.map((l) => (typeof l === "string" ? l : l.name));
    //         backportLabels = labels.filter((l) =>
    //           config.backportLabels.some((bl) => l.toLowerCase().includes(bl.toLowerCase())),
    //         );

    //         // Check PR body and comments for backport mentions
    //         const prDetails = await gh.pulls.get({ owner, repo, pull_number: prNumber });
    //         const bodyText = (prDetails.data.body || "").toLowerCase();

    //         const comments = await gh.issues
    //           .listComments({
    //             owner,
    //             repo,
    //             issue_number: prNumber,
    //           })
    //           .then((e) => e.data);

    //         const commentTexts = comments.map((c) => c.body?.toLowerCase() || "").join(" ");

    //         backportMentioned =
    //           /backport/i.test(bodyText) ||
    //           /backport/i.test(commentTexts) ||
    //           /stable/i.test(bodyText) ||
    //           /stable/i.test(commentTexts);

    //         // Determine status
    //         if (backportLabels.length > 0) {
    //           if (backportLabels.some((l) => l.toLowerCase().includes("completed"))) {
    //             backportStatus = "completed";
    //           } else if (backportLabels.some((l) => l.toLowerCase().includes("in-progress"))) {
    //             backportStatus = "in-progress";
    //           } else if (backportLabels.some((l) => l.toLowerCase().includes("needs"))) {
    //             backportStatus = "needed";
    //           } else {
    //             backportStatus = "needed";
    //           }
    //         } else if (backportMentioned) {
    //           backportStatus = "needed";
    //         } else {
    //           backportStatus = "not-needed";
    //         }

    //         console.log(`      PR #${prNumber}: ${backportStatus} (labels: ${backportLabels.join(", ")})`);
    //       } else {
    //         console.log(`      No PR found for commit`);
    //         backportStatus = "unknown";
    //       }

    //       // Save to database
    //       const task = await save({
    //         releaseUrl: release.html_url,
    //         releaseTag: release.tag_name,
    //         releaseCreatedAt: new Date(release.created_at),
    //         commitSha,
    //         commitMessage,
    //         prNumber,
    //         prUrl,
    //         prTitle,
    //         backportStatus,
    //         backportLabels,
    //         backportMentioned,
    //         checkedAt: new Date(),
    //       });

    //       allBugfixes.push(task);
    //       return task;
    //     })
    //     .run();
    // })
    .run();
  // Release Backport Status:
  // Release v${version}

  // Generate and send Slack summary if there are bugfixes
  // if (allBugfixes.length > 0) {
  //   const summary = generateSlackSummary(allBugfixes);
  //   console.log("\nSlack Summary:\n", summary);

  //   try {
  //     const slackMessage = await upsertSlackMessage({
  //       channelName: config.slackChannel,
  //       text: summary,
  //     });

  //     console.log(`Slack message sent: ${slackMessage.url}`);

  //     // Update all tasks with the slack message info
  //     await sflow(allBugfixes)
  //       .map(async (task) => {
  //         await save({
  //           commitSha: task.commitSha,
  //           slackMessage: {
  //             text: summary,
  //             channel: slackMessage.channel,
  //             url: slackMessage.url,
  //           },
  //         });
  //       })
  //       .run();
  //   } catch (error) {
  //     console.error("Failed to send Slack message:", error);
  //   }
  // } else {
  //   console.log("\nNo bugfixes found in recent releases");
  // }

  console.log(`\nProcessed ${allBugfixTasks.length} bugfix commits`);
}

// function generateSlackSummary(bugfixTasks: GithubFrontendBackportCheckerTask[]): string {
//   const grouped = new Map<string, GithubFrontendBackportCheckerTask[]>();

//   // Group by release
//   bugfixTasks.forEach((bf) => {
//     const key = bf.releaseTag;
//     if (!grouped.has(key)) {
//       grouped.set(key, []);
//     }
//     grouped.get(key)!.push(bf);
//   });

//   let summary = "🔄 *ComfyUI_frontend Backport Status Report*\n\n";

//   for (const [releaseTag, items] of grouped) {
//     const releaseUrl = items[0].releaseUrl;
//     summary += `*<${releaseUrl}|Release ${releaseTag}>*\n`;

//     // Sort by status (needed/in-progress first)
//     const sorted = items.sort((a, b) => {
//       const order = { needed: 0, "in-progress": 1, completed: 2, unknown: 3, "not-needed": 4 };
//       return order[a.backportStatus] - order[b.backportStatus];
//     });

//     sorted.forEach((item) => {
//       const emoji = getStatusEmoji(item.backportStatus);
//       const prLink = item.prUrl ? `<${item.prUrl}|#${item.prNumber}>` : "No PR";
//       const labels = item.backportLabels.length > 0 ? ` [${item.backportLabels.join(", ")}]` : "";

//       summary += `  ${emoji} ${prLink}: ${item.prTitle || item.commitMessage}${labels}\n`;
//     });

//     summary += "\n";
//   }

//   summary += `_Checked ${bugfixes.length} bugfix commits across ${grouped.size} releases_`;

//   return summary;
// }

function getStatusEmoji(status: BackportStatus): string {
  switch (status) {
    case "completed":
      return "✅";
    case "in-progress":
      return "🔄";
    case "needed":
      return "❌";
    case "not-needed":
      return "➖";
    case "unknown":
      return "❓";
    default:
      return "⚪";
  }
}
