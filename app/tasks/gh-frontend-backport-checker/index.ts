#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow from "sflow";
import { upsertSlackMarkdownMessage } from "../gh-desktop-release-notification/upsertSlackMessage";
import urlRegexSafe from "url-regex-safe";
import { ghc } from "@/lib/github/githubCached";
import { logger } from "@/src/logger";
import prettier from "prettier";
import { ghPageFlow } from "@/src/ghPageFlow";
import { match as tsmatch } from "ts-pattern";
import { getChannelInfo } from "@/lib/slack/channel-info";
import { getSlackChannel } from "@/lib/slack/channels";
import { slackCached } from "@/lib";

/**
 * GitHub Frontend Backport Checker Task
 *
 * Automatically monitors ComfyUI_frontend releases for bugfix commits that may
 * need backporting to stable branches (core/1.**, cloud/1.**), then posts a
 * per-release status report to Slack (#frontend-releases).
 *
 * ── How it works ──────────────────────────────────────────────────────────────
 *
 * 1. DISCOVER BACKPORT TARGET BRANCHES
 *    Lists all repo branches matching `core/1.**` or `cloud/1.**` via the
 *    GitHub API. These are the branches that bugfixes may need cherry-picking to.
 *
 * 2. FETCH RECENT RELEASES
 *    Fetches up to `maxReleasesToCheck` (10) releases from ComfyUI_frontend.
 *    Filters them by:
 *      - `processSince` date (skip very old releases)
 *      - `maxMinorVersionsBehind` (4) — only show releases whose minor version
 *        is at most 4 behind the latest (e.g. if latest is v1.40, v1.36 is
 *        included but v1.35 is not)
 *
 * 3. EXTRACT COMPARE LINK FROM RELEASE BODY
 *    Each release body contains a GitHub compare URL (e.g.
 *    `.../compare/v1.38.0...v1.38.1`). This is used to get the list of commits
 *    included in that release.
 *
 * 4. IDENTIFY BUGFIX COMMITS
 *    From the compare diff, filters commits whose first line matches bugfix
 *    keywords: fix, bugfix, hotfix, patch, bug (case-insensitive).
 *    Excludes commits already tagged as `[backport ...]` (already cherry-picked).
 *
 * 5. RESOLVE ASSOCIATED PR FOR EACH BUGFIX COMMIT
 *    Uses `listPullRequestsAssociatedWithCommit` to find the PR that introduced
 *    each bugfix commit.
 *
 * 6. DETERMINE BACKPORT STATUS FOR EACH PR
 *    For each bugfix PR, checks:
 *
 *    a) PR LABELS — filters labels matching `reBackportTargets` regex
 *       (e.g. `core/1.4`, `cloud/1.36`). If any such labels exist, derives
 *       `backportStatusRaw` from them: checks for "completed"/"in-progress"/
 *       "needs" substrings, but in practice these branch-style labels always
 *       fall through to the default → "needed".
 *
 *    b) PR BODY & COMMENTS — scans for mentions of "backport" or "stable"
 *       (excluding bot comments). If found, marks as "needed".
 *
 *    c) PER-TARGET-BRANCH STATUS — only runs when `backportStatusRaw` is
 *       "needed". For each labeled target branch:
 *       - Checks for `*-backport-not-needed` labels (e.g. `core-backport-not-needed`)
 *         → marks that target as "not-needed"
 *       - Uses `compareCommits(target_branch, commit_sha)` to check if the
 *         commit already exists on that branch:
 *           • "identical"/"behind" → "completed" (commit is already there)
 *           • "ahead"             → "needed" (commit is missing)
 *           • "diverged"          → searches for a backport PR with the
 *             naming convention `backport-{prNumber}-to-{branch}`:
 *               - If a merged backport PR exists → "completed"
 *               - If an open backport PR exists  → "in-progress"
 *               - Otherwise                      → "needed"
 *
 *    d) OVERALL STATUS — derived from per-target statuses (ignoring not-needed):
 *       - All completed  → "completed"
 *       - Any in-progress → "in-progress"
 *       - Any needed      → "needed"
 *       - All not-needed  → "not-needed"
 *       - Otherwise       → "unknown"
 *
 * 7. GENERATE REPORT & POST TO SLACK
 *    Builds a markdown report per release showing each bugfix and its backport
 *    status across targets. For PRs needing backport, resolves the PR author's
 *    Slack user ID (by matching GitHub username → Slack display name) and tags
 *    them. Falls back to tagging the "Release Sheriff" (parsed from the
 *    #frontend-releases channel topic/purpose).
 *
 *    The report is upserted (created or updated) as a Slack message via
 *    `upsertSlackMarkdownMessage`, so re-runs update existing messages rather
 *    than creating duplicates.
 *
 * 8. PERSISTENCE
 *    All state is stored in MongoDB collection `GithubFrontendBackportCheckerTask`,
 *    keyed by `releaseUrl`. This allows incremental re-checks and preserves
 *    Slack message references for updates.
 *
 * ── Edge Cases & Special Handling ──────────────────────────────────────────────
 *
 * • UNPARSEABLE VERSION TAGS — if `parseMinorVersion` returns null (e.g. tag
 *   "nightly" or "latest"), the release is included rather than excluded, so
 *   non-semver releases are never silently skipped.
 *
 * • MISSING COMPARE LINK — if the release body does not contain a
 *   `.../compare/...` URL, the task throws via `DIE()`. This means releases
 *   without a proper changelog are treated as errors rather than silently
 *   ignored.
 *
 * • COMPARE API FAILURE — if `compareCommits` fails for a release (e.g. tags
 *   deleted, repo renamed), the release is saved with `taskStatus: "failed"`
 *   and processing continues to the next release.
 *
 * • ALREADY-BACKPORTED COMMITS — commits whose first line matches
 *   `[backport ...]` (case-insensitive) are filtered out, preventing double-
 *   counting of cherry-pick commits that landed in the same release.
 *
 * • NO ASSOCIATED PR — if `listPullRequestsAssociatedWithCommit` returns
 *   an empty array, the commit produces no bugfix entries (the `.map().flat()`
 *   over PRs yields nothing). Direct pushes without a PR are silently skipped.
 *
 * • BOT COMMENTS — when scanning PR comments for backport mentions, comments
 *   from bots (username ending in `bot` or `[bot]`) are excluded to avoid
 *   false positives from automated messages.
 *
 * • BACKPORT-NOT-NEEDED LABELS — per-target dismissal labels like
 *   `core-backport-not-needed` override the per-branch status to "not-needed",
 *   even if the commit hasn't been cherry-picked. When ALL targets are
 *   dismissed this way, the overall status becomes "not-needed".
 *
 * • DIVERGED BRANCH (backport PR detection) — when the target branch has
 *   diverged from the commit (common for long-lived stable branches), the
 *   checker searches for a PR with branch name `backport-{prNumber}-to-{branch}`
 *   and additionally filters by `head.ref` to avoid false matches from
 *   similarly-named branches. Checks all states (open, closed, merged).
 *
 * • SLACK USER RESOLUTION — attempts to match GitHub username to a Slack user
 *   by comparing against `name`, `display_name`, and `real_name` (with spaces
 *   stripped, case-insensitive). If no match is found, falls back to tagging
 *   the Release Sheriff (parsed from #frontend-releases channel topic/purpose
 *   via regex `Release Sheriff:? <@UXXXXXX>`). If neither resolves, no one is
 *   tagged.
 *
 * • DRY RUN MODE — when `--dry-run` is passed, Slack tags show raw GitHub
 *   usernames (e.g. `@octocat`) instead of making Slack API calls, and no
 *   Slack messages are sent/updated.
 *
 * • IDEMPOTENT SLACK UPDATES — the report is only sent/updated when the
 *   formatted text differs from the previously stored `slackMessage.text`.
 *   Re-runs with no status changes produce no Slack API calls.
 *
 * • NO BUGFIX COMMITS — if a release has zero bugfix commits after filtering,
 *   the task is saved as `taskStatus: "completed"` with an empty array and no
 *   Slack message is sent.
 *
 * • CI MODE — when running in CI (`is-ci` package), the database connection
 *   is closed and the process exits after one run instead of staying alive
 *   for hot-reload.
 *
 * ── Running ───────────────────────────────────────────────────────────────────
 *
 *   bun app/tasks/gh-frontend-backport-checker/index.ts              # normal
 *   bun app/tasks/gh-frontend-backport-checker/index.ts --dry-run    # no Slack
 *
 */

const config = {
  // 1. monitor releases from this repo
  repo: "https://github.com/Comfy-Org/ComfyUI_frontend",
  maxReleasesToCheck: 10, // fetch more releases, then filter by version distance
  maxMinorVersionsBehind: 4, // stop showing backport warnings after this many minor versions behind latest
  processSince: new Date("2026-01-06T00:00:00Z").toISOString(), // only process releases since this date, to avoid posting too msgs in old releases

  // 2. identify bugfix commits
  reBugfixPatterns: /\b(fix|bugfix|hotfix|patch|bug)\b/i,

  // 4. backport target branches
  reBackportTargets: /^(core|cloud)\/1\..*$/,

  // 3. backport labels on PRs
  backportLabels: ["needs-backport"],

  // labels that dismiss backport requirements per target
  backportNotNeededLabels: {
    core: "core-backport-not-needed",
    cloud: "cloud-backport-not-needed",
  } as Record<string, string>,

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
    prAuthor?: string; // GitHub username of PR author

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

const isDryRun = process.argv.includes("--dry-run");

if (import.meta.main) {
  if (isDryRun) logger.info("🏃 DRY RUN MODE - will not send Slack messages");
  await runGithubFrontendBackportCheckerTask();
  if (isCI || isDryRun) {
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
  const releases = await ghPageFlow(ghc.repos.listReleases, { per_page: 10 })({
    ...parseGithubRepoUrl(config.repo),
  })
    .limit(config.maxReleasesToCheck)
    .toArray();

  logger.debug(`Found ${releases.length} recent releases to check`);

  // Find latest minor version for version-based filtering
  const latestMinor = releases
    .map((r) => parseMinorVersion(r.tag_name))
    .filter((v): v is number => v !== null)
    .reduce((a, b) => Math.max(a, b), 0);
  logger.info(
    `Latest minor version: ${latestMinor}, will show releases within ${config.maxMinorVersionsBehind} minor versions`,
  );

  // Process each release
  const processedReleases = await sflow(releases)
    .filter((release) => +new Date(release.created_at) >= +new Date(config.processSince))
    // Filter by version distance: show releases up to and including maxMinorVersionsBehind behind latest
    .filter((release) => {
      const minor = parseMinorVersion(release.tag_name);
      if (minor === null) return true; // can't parse, include it
      return latestMinor - minor <= config.maxMinorVersionsBehind;
    })
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
      logger.info(`\nProcessing release: ${task.releaseTag}`);

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

export function getBackportStatusEmoji(status: BackportStatus): string {
  switch (status) {
    case "completed":
      return ":pr-merged:";
    case "in-progress":
      return ":pr-open:";
    case "needed":
      return "**:exclamation: Need backport**";
    case "not-needed":
      return "➖";
    case "unknown":
      return "  ";
    default:
      return "⚪";
  }
}

export function middleTruncated(maxLength: number, str: string): string {
  if (str.length <= maxLength) return str;
  const half = Math.floor((maxLength - 3) / 2);
  return `${str.slice(0, half)}...${str.slice(-half)}`;
}

/** Parse semver minor version from a release tag like "v1.38.1" → 38 */
export function parseMinorVersion(tag: string): number | null {
  const match = tag.match(/v?\d+\.(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Get the current release sheriff's Slack user ID from the #frontend-releases channel description.
 * Expects format: "Current Release Sheriff: <@U12345678>" in channel purpose or topic.
 */
export async function getReleaseSheriffUserId(): Promise<string | null> {
  try {
    const channel = await getSlackChannel(config.slackChannelName);
    if (!channel?.id) return null;
    const info = await getChannelInfo(channel.id as string);
    // Slack stores mentions as <@U12345678> in description
    const text = `${info.purpose?.value || ""} ${info.topic?.value || ""}`;
    const match = text.match(/Release Sheriff:?\s*<@(\w+)>/i);
    return match?.[1] || null;
  } catch (e) {
    logger.warn("Failed to get release sheriff from channel description", { error: e });
    return null;
  }
}

/** Cached promise for all Slack workspace members — fetched once per run. */
let slackMembersCache: Promise<
  NonNullable<Awaited<ReturnType<typeof slackCached.users.list>>["members"]>
> | null = null;

async function getAllSlackMembers() {
  if (!slackMembersCache) {
    slackMembersCache = (async () => {
      const firstPage = await slackCached.users.list({ limit: 500 });
      const members = [...(firstPage.members || [])];
      let cursor = firstPage.response_metadata?.next_cursor || undefined;
      while (cursor) {
        const page = await slackCached.users.list({ limit: 500, cursor });
        members.push(...(page.members || []));
        cursor = page.response_metadata?.next_cursor || undefined;
      }
      return members;
    })();
  }
  return slackMembersCache;
}

/**
 * Try to find a Slack user ID for a GitHub username.
 * Matches against Slack display_name, name, and real_name (case-insensitive).
 * Returns null if no match found.
 */
export async function findSlackUserIdByGithubUsername(
  githubUsername: string,
): Promise<string | null> {
  try {
    const members = await getAllSlackMembers();
    const lowerGh = githubUsername.toLowerCase();
    const found = members.find((m) => {
      if (m.deleted || m.is_bot) return false;
      const profile = m.profile as Record<string, unknown> | undefined;
      return (
        m.name?.toLowerCase() === lowerGh ||
        (profile?.display_name as string)?.toLowerCase() === lowerGh ||
        ((profile?.real_name as string | undefined) || "")
          .toLowerCase()
          .replace(/\s+/g, "")
          .includes(lowerGh)
      );
    });
    return (found?.id as string) || null;
  } catch (e) {
    logger.warn("Failed to look up Slack user for GitHub username", {
      githubUsername,
      error: e,
    });
    return null;
  }
}

/**
 * Resolve who to tag in Slack for a backport notification.
 * Tries the PR author first, falls back to release sheriff.
 */
async function resolveSlackTagForAuthor(githubUsername?: string): Promise<string> {
  if (githubUsername) {
    const slackUserId = await findSlackUserIdByGithubUsername(githubUsername);
    if (slackUserId) return `<@${slackUserId}>`;
  }
  // Fall back to release sheriff
  const sheriffId = await getReleaseSheriffUserId();
  if (sheriffId) return `<@${sheriffId}>`;
  return ""; // no one to tag
}

/** Check if a PR has a backport-not-needed label for a given target prefix (e.g. "core" or "cloud") */
function hasBackportNotNeededLabel(labels: string[], targetPrefix: string): boolean {
  const notNeededLabel = config.backportNotNeededLabels[targetPrefix];
  if (!notNeededLabel) return false;
  return labels.some((l) => l.toLowerCase() === notNeededLabel.toLowerCase());
}

async function processTask(
  task: GithubFrontendBackportCheckerTask,
): Promise<GithubFrontendBackportCheckerTask> {
  const compareLink = task.compareLink || DIE("compareLink missing in task");

  // 2. get commits from the compare link API
  const { owner, repo, base, head } =
    compareLink.match(
      /github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/compare\/(?<base>\S+)\.\.\.(?<head>\S+)/,
    )?.groups || DIE(`Failed to parse compare link: ${compareLink}`);
  logger.debug(`  Comparing to head: ${head}`);
  let compareResult;
  try {
    compareResult = await ghc.repos
      .compareCommits({ owner, repo, base, head })
      .then((e) => e.data.commits);
  } catch (e) {
    logger.warn(`  Failed to compare ${base}...${head}, skipping release ${task.releaseTag}`, {
      error: e,
    });
    return await save({ ...task, bugfixCommits: [], taskStatus: "failed" });
  }
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
          const labels = pr.labels
            .map((l) => (typeof l === "string" ? l : l.name))
            .filter((l): l is string => !!l);
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
          const targetBranches = labels
            .filter((l) => config.reBackportTargets.test(l))
            .filter((_e) => backportStatusRaw === "needed");

          const backportTargetStatus = await sflow(targetBranches)
            .map(async (branchName) => {
              // Check for *-backport-not-needed labels first (e.g. "core/1.4" → prefix "core")
              const targetPrefix = branchName.split("/")[0];
              if (hasBackportNotNeededLabel(labels, targetPrefix)) {
                logger.debug(
                  `          Backport target branch ${branchName} marked not-needed by label`,
                );
                return {
                  branch: branchName,
                  status: "not-needed" as BackportStatus,
                  prs: [] as {
                    prUrl?: string;
                    prNumber?: number;
                    prTitle?: string;
                    prStatus?: "open" | "closed" | "merged";
                    lastCheckedAt?: Date;
                  }[],
                };
              }

              // now check if the commit is in the branch
              const comparing = await ghc.repos
                .compareCommits({
                  owner,
                  repo,
                  base: branchName,
                  head: commitSha,
                })
                .then((e) => e.data);
              let PRs: {
                prUrl?: string;
                prNumber?: number;
                prTitle?: string;
                prStatus?: "open" | "closed" | "merged";
                lastCheckedAt?: Date;
              }[] = [];
              const status: BackportStatus = await tsmatch(comparing.status)
                .with("ahead", () => "needed" as const)
                .with("identical", () => "completed" as const)
                .with("behind", () => "completed" as const)
                .with("diverged", async () => {
                  const backportBranch = `backport-${prNumber}-to-${branchName.replaceAll("/", "-")}`;
                  const backportPRs = await ghPageFlow(ghc.pulls.list)({
                    owner,
                    repo,
                    head: backportBranch,
                    base: branchName,
                    state: "all",
                  })
                    .filter((e) => e.head.ref === backportBranch)
                    .toArray();

                  PRs = backportPRs.map((bpr) => ({
                    prUrl: bpr.html_url,
                    prNumber: bpr.number,
                    prTitle: bpr.title,
                    prStatus: bpr.merged_at ? "merged" : bpr.state === "open" ? "open" : "closed",
                    lastCheckedAt: new Date(),
                  }));

                  if (backportPRs.some((e) => e.merged_at)) return "completed" as const;
                  if (backportPRs.some((e) => e.state.toUpperCase() === "OPEN"))
                    return "in-progress" as const;
                  return "needed" as const;
                })
                .otherwise(() => {
                  logger.error(
                    `unable to parse comparing status (${comparing.status}) of [pr](${pr.html_url})`,
                  );
                  return "unknown" as const;
                });

              logger.debug(`          Backport target branch ${branchName} status: ${status}`);
              return { branch: branchName, status, prs: PRs };
            })
            .toArray();

          // Determine overall backport status (ignoring "not-needed" targets)
          const activeTargets = backportTargetStatus.filter((t) => t.status !== "not-needed");
          const backportStatus: BackportStatus =
            activeTargets.length && activeTargets.every((t) => t.status === "completed")
              ? "completed"
              : activeTargets.some((t) => t.status === "in-progress")
                ? "in-progress"
                : activeTargets.some((t) => t.status === "needed")
                  ? "needed"
                  : backportTargetStatus.length && !activeTargets.length
                    ? "not-needed" // all targets have backport-not-needed labels
                    : "unknown";

          return {
            commitSha,
            commitMessage,
            prUrl,
            prNumber,
            prTitle,
            prLabels: labels,
            prAuthor: pr.user?.login,

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
    return await save({ ...task, bugfixCommits, taskStatus: "completed" });
  }

  // Resolve Slack tags for authors who have unresolved backports
  const authorTags = new Map<string, string>();
  for (const bf of bugfixCommits) {
    if (
      bf.prAuthor &&
      !authorTags.has(bf.prAuthor) &&
      bf.backportStatus !== "completed" &&
      bf.backportStatus !== "not-needed"
    ) {
      authorTags.set(bf.prAuthor, await resolveSlackTagForAuthor(bf.prAuthor));
    }
  }

  const statuses = bugfixCommits.map((e) => ({
    ...e,
    status: !e.backportTargetStatus.length
      ? ("not-mentioned" as const)
      : e.backportTargetStatus.some((t) => t.status !== "completed" && t.status !== "not-needed")
        ? ("in-progress" as const)
        : ("completed" as const),
  }));

  // - generate report based on commits, note: slack's markdown not support table
  const rawReport = `**Release [${task.releaseTag}](${task.releaseUrl}) Backport Status:${
    statuses.filter((e) => e.status !== "completed").length ? "" : " Completed"
  }** _by [backport-checker.ts](https://github.com/Comfy-Org/Comfy-PR/tree/HEAD/app/tasks/gh-frontend-backport-checker/index.ts)_

${
  // not mentioned, show might need
  statuses
    .filter((e) => !e.backportTargetStatus.length)
    .map((bf) => {
      const tag = bf.prAuthor ? authorTags.get(bf.prAuthor) || "" : "";
      return `[${middleTruncated(60, bf.commitMessage)}](${bf.prUrl}) ➡️ _❗ Might need backport_ ${tag}`.trim();
    })
    .join("\n")
}
${
  // in-progress/needed, show detailed status with author tags
  bugfixCommits
    .filter(
      (e) =>
        e.backportTargetStatus?.length &&
        e.backportTargetStatus.some((t) => t.status !== "completed" && t.status !== "not-needed"),
    )
    .map((bf) => {
      const targetsStatuses = bf.backportTargetStatus
        .map((ts) => {
          if (ts.status === "not-needed") return `${ts.branch}: ➖`;
          const prStatus = ts.prs
            .map((pr) =>
              pr.prUrl ? `[:pr-${pr.prStatus?.toLowerCase()}: #${pr.prNumber}](${pr.prUrl})` : "",
            )
            .filter(Boolean)
            .join(", ");
          return `${ts.branch}: ${prStatus || getBackportStatusEmoji(ts.status)}`;
        })
        .join(", ");
      const tag = bf.prAuthor ? authorTags.get(bf.prAuthor) || "" : "";
      return `[${middleTruncated(60, bf.commitMessage)}](${bf.prUrl}) ➡️ ${targetsStatuses} ${tag}`.trim();
    })
    .join("\n")
}

`;

  const formattedReport = await prettier.format(rawReport, { parser: "markdown" });
  logger.info(formattedReport);

  task = await save({ ...task, bugfixCommits });

  // - now lets upsert slack message
  if (isDryRun) {
    logger.info("DRY RUN: Would send/update Slack message to #" + config.slackChannelName);
  } else {
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
  }
  return {
    ...task,
    report: formattedReport,
    bugfixCommits,
  };
}
