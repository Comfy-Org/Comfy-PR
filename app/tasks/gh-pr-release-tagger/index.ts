#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { ghc } from "@/lib/github/githubCached";
import { ghPageFlow } from "@/src/ghPageFlow";
import { logger } from "@/src/logger";
import isCI from "is-ci";
import { extractOriginalPRNumber } from "./extractOriginalPRNumber";

export { extractOriginalPRNumber };

/**
 * GitHub PR Release Tagger Task
 *
 * Labels original PRs (merged to main) with `released:core` or `released:cloud`
 * when their backports are confirmed deployed.
 *
 * - `released:core` = available in the latest desktop app
 * - `released:cloud` = live on cloud.comfy.org
 *
 * Sources of truth:
 * - Core: Comfy-Org/desktop latest release → package.json → config.frontend.version
 * - Cloud: Comfy-Org/cloud → ArgoCD prod overlay → frontendVersion SHA
 */

const FRONTEND_REPO = { owner: "Comfy-Org", repo: "ComfyUI_frontend" };

export type PRReleaseTaggerState = {
  target: "core" | "cloud";
  deployedRef: string; // version tag or commit SHA
  branch: string; // e.g. "core/1.41" or "cloud/1.41"
  // Optional on disk: completed runs with zero newly labeled PRs may persist
  // without touching this field. Readers should tolerate undefined.
  labeledOriginalPRs?: Array<{
    prNumber: number;
    prUrl: string;
    prTitle: string;
    backportPrNumber: number | null;
    labeledAt: Date;
  }>;
  taskStatus: "checking" | "completed" | "failed";
  checkedAt: Date;
};

export const PRReleaseTaggerState = db.collection<PRReleaseTaggerState>("PRReleaseTaggerState");

const save = async (
  state: {
    target: PRReleaseTaggerState["target"];
    deployedRef: PRReleaseTaggerState["deployedRef"];
  } & Partial<PRReleaseTaggerState>,
) => {
  // Append-only on labeledOriginalPRs so concurrent workers / re-scans don't
  // overwrite each other's progress. Other fields are $set normally.
  const { labeledOriginalPRs, ...rest } = state;
  const update: {
    $set: typeof rest;
    $setOnInsert: { labeledOriginalPRs: NonNullable<PRReleaseTaggerState["labeledOriginalPRs"]> };
    $addToSet?: {
      labeledOriginalPRs: { $each: NonNullable<PRReleaseTaggerState["labeledOriginalPRs"]> };
    };
  } = { $set: rest, $setOnInsert: { labeledOriginalPRs: [] } };
  if (labeledOriginalPRs?.length) {
    update.$addToSet = { labeledOriginalPRs: { $each: labeledOriginalPRs } };
  }
  return (
    (await PRReleaseTaggerState.findOneAndUpdate(
      { target: state.target, deployedRef: state.deployedRef },
      update,
      { upsert: true, returnDocument: "after" },
    )) ||
    (() => {
      throw new Error("save failed");
    })()
  );
};

// ── Resolve deployed versions ──────────────────────────────────────

async function getCoreDeployedVersion(): Promise<{ ref: string; branch: string }> {
  // Read latest desktop release's package.json to get pinned frontend version
  const latestRelease = await ghc.repos.getLatestRelease({
    owner: "Comfy-Org",
    repo: "desktop",
  });
  const tag = latestRelease.data.tag_name;

  const pkgContent = await ghc.repos.getContent({
    owner: "Comfy-Org",
    repo: "desktop",
    path: "package.json",
    ref: tag,
  });

  if (!("content" in pkgContent.data) || !pkgContent.data.content) {
    throw new Error(`Expected desktop package.json at ${tag} to include file content`);
  }
  const pkg = JSON.parse(Buffer.from(pkgContent.data.content, "base64").toString("utf-8"));
  const version: string = pkg.config?.frontend?.version;
  if (!version) throw new Error("No frontend version in desktop package.json");

  const releaseTag = version.startsWith("v") ? version : `v${version}`;

  // Get the release to find target branch
  const release = await ghc.repos.getReleaseByTag({
    ...FRONTEND_REPO,
    tag: releaseTag,
  });
  const branch = release.data.target_commitish;

  logger.info(`Core deployed: ${releaseTag} on ${branch} (desktop ${tag})`);
  return { ref: releaseTag, branch };
}

async function getCloudDeployedVersion(): Promise<{ ref: string; branch: string }> {
  // Read frontend-version.json for the release branch
  const versionFile = await ghc.repos.getContent({
    owner: "Comfy-Org",
    repo: "cloud",
    path: "frontend-version.json",
  });
  if (!("content" in versionFile.data) || !versionFile.data.content) {
    throw new Error("Expected cloud frontend-version.json to include file content");
  }
  const versionConfig = JSON.parse(
    Buffer.from(versionFile.data.content, "base64").toString("utf-8"),
  );
  const branch: string = versionConfig.releaseBranch;
  if (!branch) throw new Error("No releaseBranch in cloud frontend-version.json");

  // Read ArgoCD prod overlay for deployed SHA
  const overlayFile = await ghc.repos.getContent({
    owner: "Comfy-Org",
    repo: "cloud",
    path: "infrastructure/argocd/apps/comfy-apps/charts/nginx-frontend/overlays/comfy-cloud-prod-v2/values.yaml",
  });
  if (!("content" in overlayFile.data) || !overlayFile.data.content) {
    throw new Error("Expected cloud prod overlay values.yaml to include file content");
  }
  const overlayText = Buffer.from(overlayFile.data.content, "base64").toString("utf-8");
  const shaMatch = overlayText.match(/frontendVersion:\s*"?([0-9a-fA-F]{7,40})"?/);
  if (!shaMatch) throw new Error("No frontendVersion SHA in cloud prod overlay");
  const ref = shaMatch[1];

  logger.info(`Cloud deployed: ${ref.substring(0, 7)} on ${branch}`);
  return { ref, branch };
}

// ── Ensure label exists ────────────────────────────────────────────

async function ensureLabelExists(labelName: string) {
  const { owner, repo } = FRONTEND_REPO;
  try {
    await gh.issues.getLabel({ owner, repo, name: labelName });
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) {
      const target = labelName.split(":")[1] || labelName;
      try {
        await gh.issues.createLabel({
          owner,
          repo,
          name: labelName,
          color: "0075ca",
          description: `PR has been released to ${target}`,
        });
        logger.info(`Created label '${labelName}'`);
      } catch (createErr: unknown) {
        // 422 = label already exists (race with concurrent worker)
        if ((createErr as { status?: number }).status !== 422) throw createErr;
      }
    } else {
      throw e;
    }
  }
}

// ── Process a single target (core or cloud) ────────────────────────

async function processTarget(target: "core" | "cloud") {
  const labelName = `released:${target}`;
  const { ref: deployedRef, branch } =
    target === "core" ? await getCoreDeployedVersion() : await getCloudDeployedVersion();

  // Always re-scan: previouslyLabeled (sourced from persisted state) prevents
  // redundant label writes, while re-running gives us a chance to retry any PRs
  // that hit transient compareCommits/labeling failures during a prior scan.
  const previousRun = await PRReleaseTaggerState.findOne({
    target,
    deployedRef,
    taskStatus: "completed",
  });
  if (previousRun) {
    logger.info(
      `${target}: deployed ref ${deployedRef} previously completed; re-scanning to retry any missed PR labels.`,
    );
  }

  await ensureLabelExists(labelName);

  // Note: do not pass labeledOriginalPRs here — save() uses $addToSet, so prior
  // entries are preserved across re-scans and concurrent runs.
  await save({
    target,
    deployedRef,
    branch,
    taskStatus: "checking",
    checkedAt: new Date(),
  });

  const labeledOriginalPRs: PRReleaseTaggerState["labeledOriginalPRs"] = [];
  let compareFailures = 0;

  try {
    // List recent merged PRs targeting this branch (2 pages = up to 200 PRs)
    const allClosedPRs = await ghPageFlow(ghc.pulls.list, { per_page: 100 })({
      ...FRONTEND_REPO,
      base: branch,
      state: "closed",
      sort: "updated",
      direction: "desc",
    })
      .slice(0, 200)
      .toArray();
    const mergedPRs = allClosedPRs.filter((pr) => pr.merged_at !== null);

    logger.info(`${target}: found ${mergedPRs.length} merged PRs on ${branch}`);

    // Get previously labeled PR numbers to avoid re-processing
    const previouslyLabeled = await PRReleaseTaggerState.find({ target })
      .toArray()
      .then(
        (states) =>
          new Set(states.flatMap((s) => s.labeledOriginalPRs?.map((p) => p.prNumber) || [])),
      );

    for (const backportPR of mergedPRs) {
      // Check if backport PR's merge commit is ancestor of deployed ref
      if (!backportPR.merge_commit_sha) continue;

      try {
        const comparison = await ghc.repos.compareCommits({
          ...FRONTEND_REPO,
          base: deployedRef,
          head: backportPR.merge_commit_sha,
        });
        // If status is "behind" or "identical", the merge commit is included in deployed ref
        if (comparison.data.status !== "behind" && comparison.data.status !== "identical") {
          continue; // merge commit is ahead of deployed ref, not yet released
        }
      } catch (err: unknown) {
        compareFailures++;
        logger.warn(
          `${target}: compareCommits failed for #${backportPR.number} (${backportPR.merge_commit_sha}): ${(err as Error).message}`,
        );
        continue;
      }

      // Extract original PR number from backport body or title
      const originalPRNumber = extractOriginalPRNumber(backportPR.body, backportPR.title);

      if (!originalPRNumber) {
        // Skip PRs without a backport reference: version-bump release commits,
        // branch-only fixups, etc. They produce noisy / meaningless labels and
        // can't be traced back to a user-facing main-branch PR. Legitimate
        // hot-fixes can opt in by adding "Backport of #NNN" to the body.
        logger.debug(
          `${target}: skipping #${backportPR.number} "${backportPR.title}" — no backport reference`,
        );
        continue;
      }

      // Label the original PR
      if (previouslyLabeled.has(originalPRNumber)) {
        continue;
      }

      try {
        const originalPR = await ghc.pulls.get({
          ...FRONTEND_REPO,
          pull_number: originalPRNumber,
        });

        // Check if already has label
        const hasLabel = originalPR.data.labels.some(
          (l) => (typeof l === "string" ? l : l.name) === labelName,
        );
        if (hasLabel) {
          previouslyLabeled.add(originalPRNumber);
          continue;
        }

        await gh.issues.addLabels({
          ...FRONTEND_REPO,
          issue_number: originalPRNumber,
          labels: [labelName],
        });

        logger.info(
          `${target}: labeled original PR #${originalPRNumber} "${originalPR.data.title}" (via backport #${backportPR.number})`,
        );

        labeledOriginalPRs.push({
          prNumber: originalPRNumber,
          prUrl: originalPR.data.html_url,
          prTitle: originalPR.data.title,
          backportPrNumber: backportPR.number,
          labeledAt: new Date(),
        });
        previouslyLabeled.add(originalPRNumber);
      } catch (err: unknown) {
        logger.error(
          `${target}: failed to label original PR #${originalPRNumber}: ${(err as Error).message}`,
        );
      }
    }

    await save({
      target,
      deployedRef,
      branch,
      labeledOriginalPRs,
      taskStatus: "completed",
      checkedAt: new Date(),
    });

    if (compareFailures > 0) {
      logger.warn(
        `${target}: ${compareFailures} compareCommits failures — affected PRs will be retried on next run`,
      );
    }
    logger.info(
      `${target}: completed — labeled ${labeledOriginalPRs.length} original PRs for deployed ref ${deployedRef}`,
    );
  } catch (err: unknown) {
    logger.error(`${target}: failed — ${(err as Error).message}`);
    await save({
      target,
      deployedRef,
      branch,
      labeledOriginalPRs,
      taskStatus: "failed",
      checkedAt: new Date(),
    });
  }
}

// ── Main ───────────────────────────────────────────────────────────

if (import.meta.main) {
  await runGithubPRReleaseTaggerTask();
  console.log("done");
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

export default async function runGithubPRReleaseTaggerTask() {
  // The compound { target, deployedRef } index already serves target-only
  // queries via the leftmost-prefix rule, so no separate { target: 1 } index.
  await PRReleaseTaggerState.createIndex({ target: 1, deployedRef: 1 }, { unique: true });
  await PRReleaseTaggerState.createIndex({ checkedAt: 1 });

  await processTarget("core");
  await processTarget("cloud");
}
