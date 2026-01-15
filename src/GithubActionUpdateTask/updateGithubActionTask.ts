import DIE from "@snomiao/die";
import fastDiff from "fast-diff";
import { readFile } from "fs/promises";
import sha256 from "sha256";
import { createPR } from "../createGithubPullRequest";
import { gh } from "@/lib/github";
import { createLogger } from "../logger";
import { parsePullUrl } from "../parsePullUrl";
import { GithubActionUpdateTask } from "./GithubActionUpdateTask";
import { updateGithubActionPrepareBranch } from "./updateGithubActionPrepareBranch";

const logger = createLogger("updateGithubActionTask");

export const referenceActionContent = await readFile("./templates/publish.yaml", "utf8");
export const referencePullRequestMessage = await readFile(
  "./templates/tasks/GithubActionUpdatePR.md",
  "utf8",
);
export const referenceActionContentHash = sha256(referenceActionContent); // check if target publish.yaml already latest
logger.debug("referenceActionContentHash", { referenceActionContentHash });

// for debug only
export const testUpdatedPublishYaml = await readFile(
  import.meta.dir + "/test-updated-publish.yml",
  "utf8",
);

if (import.meta.main) {
  // const repo = "https://github.com/aigc-apps/VideoX-Fun";
  const repo = "https://github.com/FuouM/ComfyUI-MatAnyone";
  await resetErrorForGithubActionUpdateTask(repo);
  logger.info("Task result", { result: await updateGithubActionTask(repo) });
  logger.info("Task status", { task: await GithubActionUpdateTask.findOne({ repo }) });
  logger.info("done");
}

/**
 * Status:
 * 1. Check if repo is already up to date
 * 2. if not, make a branch and update the publish.yaml
 * 3. make pr
 * 4. check pr status, track pr comments
 */
export async function updateGithubActionTask(repoUrl: string) {
  const task = (await GithubActionUpdateTask.findOneAndUpdate(
    { repo: repoUrl },
    { $set: { updatedAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  ))!;

  // check if already up to date
  if (referenceActionContentHash !== task.branchVersionHash) {
    logger.info("AI Suggesting PR", { repoUrl });
    // make branch
    const {
      hash,
      forkedBranchUrl,
      commitMessage,
      pullRequestMessage,
      diff: branchDiffResult,
      upToDate,
    } = await updateGithubActionPrepareBranch(repoUrl);

    const updatedTask = await GithubActionUpdateTask.findOneAndUpdate(
      { repo: repoUrl },
      {
        $set: {
          branchVersionHash: hash,
          upToDateHash: upToDate ? hash : undefined,
          forkedBranchUrl,
          commitMessage,
          pullRequestMessage,
          branchDiffResult,
          status: upToDate ? "up-to-date" : "pending-approve",
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    )!;
    Object.assign(task, updatedTask);
    logger.debug("Branch update details", {
      repo: repoUrl,
      hash,
      forkedBranchUrl,
      commitMessage,
      pullRequestMessage,
      branchDiffResult,
    });
  }

  if (
    referenceActionContentHash !== task.pullRequestVersionHash &&
    referenceActionContentHash === task.approvedBranchVersionHash
  ) {
    logger.info("Creating PR", { repoUrl });
    const [src, branch] = task.forkedBranchUrl!.split("/tree/");
    const pullRequestUrl = await createPR({
      branch: branch || DIE("missing branch in forkedBranchUrl: " + task.forkedBranchUrl),
      src: src || DIE("missing origin in forkedBranchUrl: " + task.forkedBranchUrl),
      dst: repoUrl,
      msg: task.pullRequestMessage || DIE("approved task is missing pullRequestMessage"),
    });
    const updatedTask = await GithubActionUpdateTask.findOneAndUpdate(
      { repo: repoUrl },
      {
        $set: {
          pullRequestUrl,
          pullRequestVersionHash: task.approvedBranchVersionHash,
          updatedAt: new Date(),
          status: "opened",
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    Object.assign(task, updatedTask);
  }
  // update pr status if pr url is available
  if (
    task.pullRequestUrl &&
    (task.pullRequestSyncAt ?? 0) < new Date(Date.now() - 1000 * 60 * 5) &&
    task.status !== "closed" &&
    task.status !== "merged"
  ) {
    const { owner, repo, pull_number } = parsePullUrl(task.pullRequestUrl);
    const { data: pr } = await gh.pulls.get({ owner, repo, pull_number });
    const pullRequestStatus = pr.merged_at ? "MERGED" : pr.closed_at ? "CLOSED" : "OPEN";
    logger.info("PR status retrieved", { pullRequestStatus, url: task.pullRequestUrl });
    const pullRequestCommentsCount = pr.comments;
    logger.info("PR comments count", { pullRequestCommentsCount, url: task.pullRequestUrl });

    const rawComments =
      pullRequestCommentsCount === 0
        ? []
        : await gh.issues
            .listComments({
              owner,
              repo,
              issue_number: pull_number,
            })
            .then((res) => res.data);
    if (rawComments.length !== pullRequestCommentsCount)
      throw new Error("pullRequestCommentsCount not match some information may be outdated", {
        cause: { rawComments, pullRequestCommentsCount },
      });
    const pullRequestComments: string = rawComments
      .filter((e) => !e.user?.login?.endsWith("[bot]"))
      .map((cmt) => JSON.stringify({ user: cmt.user?.login ?? "unknown", text: cmt.body }))
      .join("\n");

    const newCommentsMessage = fastDiff(task.pullRequestComments ?? "", pullRequestComments)
      .map(([dir, content]) => {
        if (dir === 0) return "";
        const sign = dir == 1 ? "+" : "-";
        return content
          .split("\n")
          .map((e) => `${sign} ${e}`)
          .join("\n");
      })
      .join("\n");
    // filter out new pr comments, maybe send to slack
    if (newCommentsMessage) {
      logger.debug("New PR comments", { newCommentsMessage });
    }

    const updatedTask = await GithubActionUpdateTask.findOneAndUpdate(
      { repo: repoUrl },
      {
        $set: {
          pullRequestSyncAt: new Date(),
          pullRequestStatus,
          pullRequestComments,
          pullRequestCommentsCount,
          updatedAt: new Date(),
          status:
            pullRequestStatus === "MERGED"
              ? "merged"
              : pullRequestStatus === "CLOSED"
                ? "closed"
                : "opened",
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    Object.assign(task, updatedTask);
  }
  // delete origin branch - WIP
  // if (task.forkedBranchUrl && task.pullRequestStatus === "MERGED") {
  //   const [src, branch] = task.forkedBranchUrl.split("/tree/");
  //   await gh.git.deleteRef({ owner: src.split("/").pop()!, ref: `heads/${branch}` });
  //   await GithubActionUpdateTask.findOneAndUpdate(
  //     { repo },
  //     { $set: { forkedBranchCleaningStatus: "cleaned", updatedAt: new Date() } },
  //     { upsert: true, returnDocument: "after" },
  //   );
  // }
  logger.info("Task updated", { repoUrl });
}
export async function resetErrorForGithubActionUpdateTask(repo: string) {
  await GithubActionUpdateTask.findOneAndDelete({ repo });
  await GithubActionUpdateTask.findOneAndUpdate(
    { repo },
    { $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
}
