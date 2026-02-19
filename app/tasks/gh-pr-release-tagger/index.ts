#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { ghc } from "@/lib/github/githubCached";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { ghPageFlow } from "@/src/ghPageFlow";
import { logger } from "@/src/logger";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import sflow from "sflow";

/**
 * GitHub PR Release Tagger Task
 *
 * Workflow:
 * 1. List all branches matching core/1.* and cloud/1.* patterns in ComfyUI_frontend
 * 2. For each matching branch, get recent releases
 * 3. For each release, compare to the previous release on same branch to get commits
 * 4. For each commit, find associated PRs
 * 5. Add a 'released:core' or 'released:cloud' label to those PRs
 * 6. Track processed releases in MongoDB to avoid re-processing
 */

const config = {
  repo: "https://github.com/Comfy-Org/ComfyUI_frontend",
  // Matches core/1.* and cloud/1.* branches
  reReleaseBranchPatterns: /^(core|cloud)\/1\.\d+$/,
  // Labels to add when a PR has been released
  getLabelForBranch: (branch: string) => `released:${branch.split("/")[0]}`,
  maxReleasesToCheck: 5,
  processSince: new Date("2026-01-01T00:00:00Z").toISOString(),
};

export type GithubPRReleaseTaggerTask = {
  releaseUrl: string; // unique index
  releaseTag: string;
  branch: string;
  labeledPRs: Array<{
    prNumber: number;
    prUrl: string;
    prTitle: string;
    labeledAt: Date;
  }>;
  taskStatus: "checking" | "completed" | "failed";
  checkedAt: Date;
};

export const GithubPRReleaseTaggerTask = db.collection<GithubPRReleaseTaggerTask>(
  "GithubPRReleaseTaggerTask",
);

const save = async (task: { releaseUrl: string } & Partial<GithubPRReleaseTaggerTask>) =>
  (await GithubPRReleaseTaggerTask.findOneAndUpdate(
    { releaseUrl: task.releaseUrl },
    { $set: task },
    { upsert: true, returnDocument: "after" },
  )) || DIE("never");

async function ensureLabelExists(owner: string, repo: string, labelName: string) {
  try {
    await gh.issues.getLabel({ owner, repo, name: labelName });
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 404) {
      const branchPrefix = labelName.split(":")[1] || labelName;
      await gh.issues.createLabel({
        owner,
        repo,
        name: labelName,
        color: "0075ca", // blue color
        description: `PR has been released to ${branchPrefix}`,
      });
      logger.info(`Created label '${labelName}' in ${owner}/${repo}`);
    } else {
      throw e;
    }
  }
}

if (import.meta.main) {
  await runGithubPRReleaseTaggerTask();
  console.log("done");
  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

export default async function runGithubPRReleaseTaggerTask() {
  await GithubPRReleaseTaggerTask.createIndex({ releaseUrl: 1 }, { unique: true });
  await GithubPRReleaseTaggerTask.createIndex({ releaseTag: 1 });
  await GithubPRReleaseTaggerTask.createIndex({ branch: 1 });
  await GithubPRReleaseTaggerTask.createIndex({ checkedAt: 1 });

  const { owner, repo } = parseGithubRepoUrl(config.repo);

  // Step 1: List all branches matching the release branch patterns
  const releaseBranches = await ghPageFlow(ghc.repos.listBranches)({ owner, repo })
    .filter((branch) => config.reReleaseBranchPatterns.test(branch.name))
    .map((branch) => branch.name)
    .toArray();

  logger.info(`Found ${releaseBranches.length} release branches: ${releaseBranches.join(", ")}`);

  if (!releaseBranches.length) {
    logger.info("No release branches found, skipping.");
    return;
  }

  // Step 2: Get all recent releases and filter by target_commitish matching our branches
  const allReleases = await ghPageFlow(ghc.repos.listReleases, { per_page: 20 })({ owner, repo })
    .filter((release) => +new Date(release.created_at) >= +new Date(config.processSince))
    .filter((release) => releaseBranches.includes(release.target_commitish))
    .toArray();

  logger.info(`Found ${allReleases.length} releases on release branches since processSince`);

  // Step 3: Group releases by branch and sort each group by created_at (ascending)
  const releasesByBranch = new Map<string, typeof allReleases>();
  for (const release of allReleases) {
    const branch = release.target_commitish;
    if (!releasesByBranch.has(branch)) {
      releasesByBranch.set(branch, []);
    }
    releasesByBranch.get(branch)!.push(release);
  }

  // Sort each group ascending by created_at so we can determine prev/next
  for (const [branch, releases] of releasesByBranch) {
    releases.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    logger.info(
      `Branch ${branch}: ${releases.length} releases (${releases.map((r) => r.tag_name).join(", ")})`,
    );
  }

  // Step 4: Process each branch's releases
  await sflow([...releasesByBranch.entries()])
    .map(async ([branch, releases]) => {
      const labelName = config.getLabelForBranch(branch);

      // Ensure the label exists before processing
      await ensureLabelExists(owner, repo, labelName);

      // Take only the most recent N releases per branch
      const releasesToProcess = releases.slice(-config.maxReleasesToCheck);

      await sflow(releasesToProcess)
        .map(async (release, index) => {
          const releaseUrl = release.html_url;
          const releaseTag = release.tag_name;

          // Check if already completed in DB
          const existing = await GithubPRReleaseTaggerTask.findOne({ releaseUrl });
          if (existing?.taskStatus === "completed") {
            logger.debug(`Release ${releaseTag} on ${branch} already processed, skipping.`);
            return existing;
          }

          logger.info(`Processing release ${releaseTag} on branch ${branch}`);

          // Save initial state
          let task = await save({
            releaseUrl,
            releaseTag,
            branch,
            labeledPRs: existing?.labeledPRs || [],
            taskStatus: "checking",
            checkedAt: new Date(),
          });

          try {
            // Step 5: Determine the base for comparison
            // Use previous release tag on same branch, or branch HEAD if first release
            const previousRelease =
              index > 0 ? releasesToProcess[index - 1] : null;

            let base: string;
            let head: string;

            if (previousRelease) {
              base = previousRelease.tag_name;
              head = releaseTag;
            } else {
              // For the first release, compare the branch HEAD back against the release tag
              // We compare from a point before - use the branch itself as base
              // This gives us commits up to this release
              base = branch;
              head = releaseTag;
            }

            logger.debug(`  Comparing ${base}...${head}`);

            // Step 6: Get commits between previous release and this release
            const compareResult = await ghc.repos
              .compareCommits({ owner, repo, base, head })
              .then((e) => e.data.commits)
              .catch((err: unknown) => {
                // If comparison fails (e.g. no common ancestor), try other direction
                logger.warn(
                  `  compareCommits failed for ${base}...${head}: ${(err as Error).message}`,
                );
                return [];
              });

            logger.debug(`  Found ${compareResult.length} commits in release ${releaseTag}`);

            // Step 7: For each commit, find associated PRs and label them
            const labeledPRs: GithubPRReleaseTaggerTask["labeledPRs"] = [
              ...(task.labeledPRs || []),
            ];
            const alreadyLabeledPrNumbers = new Set(labeledPRs.map((p) => p.prNumber));

            await sflow(compareResult)
              .map(async (commit) => {
                const commitSha = commit.sha;

                // Find PRs associated with this commit
                const prs = await ghc.repos
                  .listPullRequestsAssociatedWithCommit({
                    owner,
                    repo,
                    commit_sha: commitSha,
                  })
                  .then((e) => e.data)
                  .catch((err: unknown) => {
                    logger.warn(
                      `  Failed to get PRs for commit ${commitSha.substring(0, 7)}: ${(err as Error).message}`,
                    );
                    return [];
                  });

                for (const pr of prs) {
                  if (alreadyLabeledPrNumbers.has(pr.number)) {
                    logger.debug(
                      `    PR #${pr.number} already labeled with ${labelName}, skipping.`,
                    );
                    continue;
                  }

                  // Check if PR already has this label
                  const existingLabels = pr.labels.map((l) =>
                    typeof l === "string" ? l : l.name || "",
                  );
                  if (existingLabels.includes(labelName)) {
                    logger.debug(`    PR #${pr.number} already has label ${labelName}, skipping.`);
                    alreadyLabeledPrNumbers.add(pr.number);
                    labeledPRs.push({
                      prNumber: pr.number,
                      prUrl: pr.html_url,
                      prTitle: pr.title,
                      labeledAt: new Date(),
                    });
                    continue;
                  }

                  try {
                    // Add label to PR using non-cached gh client (write operation)
                    await gh.issues.addLabels({
                      owner,
                      repo,
                      issue_number: pr.number,
                      labels: [labelName],
                    });

                    logger.info(
                      `    Labeled PR #${pr.number} "${pr.title}" with '${labelName}'`,
                    );
                    alreadyLabeledPrNumbers.add(pr.number);
                    labeledPRs.push({
                      prNumber: pr.number,
                      prUrl: pr.html_url,
                      prTitle: pr.title,
                      labeledAt: new Date(),
                    });
                  } catch (err: unknown) {
                    logger.error(
                      `    Failed to label PR #${pr.number}: ${(err as Error).message}`,
                    );
                  }
                }
              })
              .run();

            task = await save({
              releaseUrl,
              releaseTag,
              branch,
              labeledPRs,
              taskStatus: "completed",
              checkedAt: new Date(),
            });

            logger.info(
              `  Completed release ${releaseTag}: labeled ${labeledPRs.length} PRs total`,
            );
          } catch (err: unknown) {
            logger.error(
              `  Failed to process release ${releaseTag} on ${branch}: ${(err as Error).message}`,
            );
            task = await save({
              releaseUrl,
              taskStatus: "failed",
              checkedAt: new Date(),
            });
          }

          return task;
        })
        .run();
    })
    .run();
}
