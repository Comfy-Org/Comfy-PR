#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow from "sflow";
import {
  upsertSlackMarkdownMessage,
  upsertSlackMessage,
} from "../gh-desktop-release-notification/upsertSlackMessage";
import urlRegexSafe from "url-regex-safe";
import { ghc } from "@/lib/github/githubCached";
import { logger } from "@/src/logger";
import { map, maxLength } from "zod";
import prettier from "prettier";
import { slackBot } from "@/lib/slack";
import { ghPageFlow } from "@/src/ghPageFlow";
import { match as tsmatch } from "ts-pattern";

/**
 * GitHub Frontend Backport Checker Task
 *
 * Workflow:
 * 1. Monitor ComfyUI_frontend recent N releases
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
  // 1. monitor releases from this repo
  repo: "https://github.com/Comfy-Org/ComfyUI_frontend",
  maxReleasesToCheck: 5,
  processSince: new Date("2026-01-06T00:00:00Z").toISOString(), // only process releases since this date, to avoid posting too msgs in old releases

  // 2. identify bugfix commits
  reBugfixPatterns: /\b(fix|bugfix|hotfix|patch|bug)\b/i,

  // 4. backport target branches
  reBackportTargets: /^(core|cloud)\/1\..*$/,

  // 3. backport labels on PRs
  backportLabels: ["needs-backport"],

  // 5. detect backport mentions
  reBackportMentionPatterns: /\b(backports?|stable)\b/i,

  // 6. report to slack channel
  slackChannelName: "frontend-releases",
};

export type BackportStatus = "not-needed" | "needed" | "in-progress" | "completed" | "unknown";

// track each bugfix PR backport status
export type GithubFrontendBackportCheckerTask = {
  releaseUrl: string; // this is uniq id
  releaseTag: string;
  releaseCreatedAt: Date;
  compareLink?: string;

  // bugfix commits info, the PR needs to be backported
  bugfixCommits?: Array<{
    commitSha: string;
    commitMessage: string;
    prUrl?: string; //
    prNumber?: number;
    prTitle?: string;
    prLabels?: string[];

    backportStatus: BackportStatus; // overall status, derived from backportTargetStatus, calculated by backport targets (core/1.**, cloud/1.**)
    backportStatusRaw: BackportStatus; // raw status from bugfix PR analysis, before checking backport targets status
    backportLabels: string[];
    backportMentioned: boolean;
    backportTargetStatus: Array<{
      status: BackportStatus;
      branch: string;
      prs: {
        prUrl?: string; // if backport PR exists
        prNumber?: number;
        prTitle?: string;
        prStatus?: "open" | "closed" | "merged";
        lastCheckedAt?: Date;
      }[];
    }>;
  }>;

  taskStatus?: "checking" | "completed" | "failed";
  checkedAt: Date; // when was this checked

  report?: string; // generated report markdown

  // slack message info, updated when message is sent/updated
  slackMessage?: {
    text: string;
    channel: string;
    url?: string;
  };
};

export const GithubFrontendBackportCheckerTask = db.collection<GithubFrontendBackportCheckerTask>(
  "GithubFrontendBackportCheckerTask",
);
const save = async (task: { releaseUrl: string } & Partial<GithubFrontendBackportCheckerTask>) =>
  (await GithubFrontendBackportCheckerTask.findOneAndUpdate(
    { releaseUrl: task.releaseUrl },
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
  await GithubFrontendBackportCheckerTask.createIndex({ releaseUrl: 1 }, { unique: true });
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
  const releases = await ghPageFlow(ghc.repos.listReleases, { per_page: 3 })({
    ...parseGithubRepoUrl(config.repo),
  })
    .limit(config.maxReleasesToCheck)
    .toArray();

  logger.debug(`Found ${releases.length} recent releases to check`);

  // Process each release
  const processedReleases = await sflow(releases)
    .filter((release) => +new Date(release.created_at) >= +new Date(config.processSince))
    .map(async function convertReleaseToTask(release) {
      const compareLink =
        (
          release.body
            ?.matchAll(urlRegexSafe())
            .map((g) => g[0])
            .toArray() || []
        ).find((u) => u.includes(`${config.repo}/compare/`)) ||
        DIE("No compare link found in release body, do we have a proper changelog?");
      logger.debug(`  Found compare link: ${compareLink}`);

      let task = await save({
        releaseUrl: release.html_url,
        releaseTag: release.tag_name,
        releaseCreatedAt: new Date(release.created_at),

        taskStatus: "checking",
        checkedAt: new Date(),
      });
      console.log(`\nProcessing release: ${task.releaseTag}`);

      // 1. find full changelog link in release body, e.g. https://github.com/Comfy-Org/ComfyUI_frontend/compare/v1.38.0...v1.38.1
      return await save({ ...task, compareLink });
    })
    .map(processTask)
    .toArray();

  logger.info(
    `\nProcessed ${processedReleases.length} releases, checked ${
      processedReleases.flatMap((r) => r.bugfixCommits).length
    } bugfix commits.`,
  );
}

function getBackportStatusEmoji(status: BackportStatus): string {
  switch (status) {
    case "completed":
      return ":pr-merged:";
    case "in-progress":
      return ":pr-open:";
    case "needed":
      return ":exclamation:";
    case "not-needed":
      return "➖";
    case "unknown":
      return "  ";
    default:
      return "⚪";
  }
}

function middleTruncated(maxLength: number, str: string): string {
  if (str.length <= maxLength) return str;
  const half = Math.floor((maxLength - 3) / 2);
  return `${str.slice(0, half)}...${str.slice(-half)}`;
}

async function processTask(
  task: GithubFrontendBackportCheckerTask,
): Promise<GithubFrontendBackportCheckerTask> {
  const compareLink = task.compareLink || DIE("compareLink missing in task");

  // 2. get commits from the compare link API
  const { owner, repo, base, head } =
    compareLink.match(
      /github\.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)\/compare\/(?<base>\S+)\.\.\.(?<head>\S+)/,
    )?.groups || DIE(`Failed to parse compare link: ${compareLink}`);
  logger.debug(`  Comparing to head: ${head}`);
  // const compareApiUrl = compareLink
  const compareResult = await ghc.repos
    .compareCommits({ owner, repo, base, head })
    .then((e) => e.data.commits);
  logger.debug(`  Found ${compareResult.length} commits in release`);

  // // collect already backported commits, for logging purpose
  // await sflow(compareResult)
  //   .filter((commit) => /\[backport .*?\]/i.test(commit.commit.message.split("\n")[0]))
  //   .map(async (commit) => {
  //     const commitSha = commit.sha;
  //     const commitMessage = commit.commit.message.split("\n")[0]; // First line only
  //     logger.debug(
  //       `    Found already backported commit: ${commitSha.substring(0, 7)} - ${commitMessage}`,
  //     );
  //   })
  //   .run();

  // 3. process each commits (need to backport)
  const bugfixCommits = await sflow(compareResult)
    // filter bugfix commits
    .filter((commit) => config.reBugfixPatterns.test(commit.commit.message.split("\n")[0]))
    // filter out [backport .*] commits
    .filter((commit) => !/\[backport .*?\]/i.test(commit.commit.message.split("\n")[0]))

    .map(async function processBugfixCommit(commit) {
      const commitSha = commit.sha;
      const commitMessage = commit.commit.message.split("\n")[0]; // First line only

      logger.debug(`    Checking commit: ${commitSha.substring(0, 7)} - ${commitMessage}`);

      // Find associated PR(s)
      const prs = await ghc.repos
        .listPullRequestsAssociatedWithCommit({
          owner,
          repo,
          commit_sha: commitSha,
        })
        .then((e) => e.data);
      logger.debug(`      Found ${prs.length} associated PR(s)`); // usually have only one

      return sflow(prs)
        .map(async function processBugfixPR(pr) {
          const prNumber = pr.number;
          const prUrl = pr.html_url;
          const prTitle = pr.title;

          logger.debug(`      Processing PR #${prNumber}: ${prTitle}`);

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

          const backportMentioned = config.reBackportMentionPatterns.test(
            bodyText + "\n" + commentTexts,
          );

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

          logger.debug(
            `        PR #${prNumber} backport status: ${backportStatusRaw} (labels: ${backportLabels.join(
              ", ",
            )})`,
          );
          // check each backport target branch status
          const backportTargetStatus = await sflow(
            labels.filter((l) => config.reBackportTargets.test(l)),
          )
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
              let PRs: {
                prUrl?: string; // if backport PR exists
                prNumber?: number;
                prTitle?: string;
                prStatus?: "open" | "closed" | "merged";
                lastCheckedAt?: Date;
              }[] = [];
              const status: BackportStatus = await tsmatch(comparing.status)
                .with("ahead", () => "needed" as const) // not yet backported
                .with("identical", () => "completed" as const) // completed, because fix commit is already in the target branch
                .with("behind", () => "completed" as const) // completed, because fix commit is already in the target branch

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
                    state: "all", // include closed/merged prs
                  })
                    .filter((e) => e.head.ref === backportBranch) // hack bug: github api seems also returns other prs
                    .toArray();

                  PRs = backportPRs.map((pr) => ({
                    prUrl: pr.html_url,
                    prNumber: pr.number,
                    prTitle: pr.title,
                    prStatus: pr.merged_at ? "merged" : pr.state === "open" ? "open" : "closed",
                    lastCheckedAt: new Date(),
                  }));

                  // if pr is merged
                  if (backportPRs.some((e) => e.merged_at)) return "completed" as const; // some of backport prs are merged
                  if (backportPRs.some((e) => e.state.toUpperCase() === "OPEN")) {
                    return "in-progress" as const; // some of backport prs are open
                  }
                  // backportPRs[0].closed_at
                  // if pr is merged
                  // return comparing.status;
                  return "needed" as const;
                })
                .otherwise(() => {
                  logger.error(
                    `unable to parse comparing status (${comparing.status}) of [pr](${pr.html_url})`,
                  );
                  return "unknown" as const;
                });

              // if (isInBranch) {
              //   status = "completed";
              // } else {j
              //   status = "needed";
              // }
              logger.debug(`          Backport target branch ${branchName} status: ${status}`);
              return { branch: branchName, status, prs: PRs };
            })
            .toArray();

          const backportStatus: BackportStatus =
            backportTargetStatus.length &&
            backportTargetStatus.every((t) => t.status === "completed")
              ? "completed"
              : backportTargetStatus.some((t) => t.status === "in-progress")
                ? "in-progress"
                : backportTargetStatus.some((t) => t.status === "needed")
                  ? "needed"
                  : "unknown";
          // Save to database
          return {
            commitSha,
            commitMessage,
            prUrl,
            prNumber,
            prTitle,
            prLabels: labels,

            backportStatus,
            backportStatusRaw,
            backportLabels,
            backportMentioned,
            backportTargetStatus,
          };
        })
        .toArray();
    })
    .flat()
    .toArray();

  if (!bugfixCommits.length) {
    // no need to report
    return await save({ ...task, bugfixCommits, taskStatus: "completed" });
  }

  // - generate report based on commits, note: slack's markdown not support table
  const rawReport = `## Release [${task.releaseTag}](${task.releaseUrl}) Backport Status: 

${bugfixCommits
  .map((bf) => {
    // const notes = bf.prLabels?.length
    //   ? ``
    //   : bf.backportMentioned
    //     ? "**Mentioned**"
    //     : "";
    const targetsStatuses = bf.backportTargetStatus
      .map((ts) => {
        const prStatus = ts.prs
          .map((pr) =>
            pr.prUrl ? `[:pr-${pr.prStatus?.toLowerCase()}: #${pr.prNumber}](${pr.prUrl})` : "",
          )
          .filter(Boolean)
          .join(", ");
        // show pr status if exists
        return `${ts.branch}: ${prStatus || getBackportStatusEmoji(ts.status)}`;
      })
      .join(", ");
    return `[${middleTruncated(60, bf.commitMessage)}](${bf.prUrl}) -- ${targetsStatuses || "_not mentioned_"}`;
  })
  .join("\n")}
`;

  const formattedReport = await prettier.format(rawReport, { parser: "markdown" });
  logger.info(formattedReport);

  task = await save({ ...task, bugfixCommits });

  // - now lets upsert slack message

  process.env.DRY_RUN = "";

  if (formattedReport.trim() !== task.slackMessage?.text?.trim()) {
    const msg = await upsertSlackMarkdownMessage({
      channelName: config.slackChannelName,
      markdown: formattedReport,
      url: task.slackMessage?.url,
    });
    task = await save({
      ...task,
      slackMessage: { text: msg.text, channel: msg.channel, url: msg.url },
    });
  }
  return {
    ...task,
    report: formattedReport,
    bugfixCommits,
  };
}
