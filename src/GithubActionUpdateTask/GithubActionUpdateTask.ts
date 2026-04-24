import { db } from "../db";

// task: https://www.notion.so/drip-art/Send-mass-PR-for-all-custom-node-repo-to-update-their-github-action-workflow-1626d73d365080439da3df94c95ad5e7
// this task aim to update the repos /publish.yaml

export const GithubActionUpdateTask = db.collection<{
  // cached status
  status?:
    | "error"
    | "pending-branch"
    | "pending-approve"
    | "pending-pr"
    | "opened"
    | "merged"
    | "closed"
    | "up-to-date";

  // stage 0, import repo url
  repo: string;
  error?: string;
  updatedAt?: Date;

  // stage 1, fork and update, preview in web, approve by manual
  branchVersionHash?: string; // = referenceActionContentHash when branch created
  upToDateHash?: string; // = branchVersionHash when it's already up to date before pr created
  forkedBranchUrl?: string;
  branchDiffResult?: string;
  commitMessage?: string; // generated commit message
  pullRequestMessage?: string; // generated pr message

  // stage 1.5, approve by manual after review
  approvedBranchVersionHash?: string; // = branchVersionHash when approved

  // stage 2, create pr by ComfyPR Bot if approved approvedBranchVersionHash === branchVersionHash
  pullRequestVersionHash?: string; // = approvedBranchVersionHash when pr created
  pullRequestUrl?: string; // url

  // stage 3, check pr status
  pullRequestSyncAt?: Date; // last sync time, 5min cold down
  pullRequestStatus?: "OPEN" | "MERGED" | "CLOSED";
  pullRequestCommentsCount?: number;
  pullRequestComments?: string; // tracking pr comments, simply store the repo owners' response, to determine if we need to follow-up the pr

  // stage 4, clean forked repo after pr was merged/closed
  forkedBranchCleaningStatus?: "cleaned" | "keep";
}>("GithubActionUpdateTask");

// Performance: sparse index on error — primarily speeds up { error: { $exists: false } } (main task scanner)
// Note: unanchored regex queries (e.g. /\bRETRYABLE\b/) still scan; index helps only for existence checks
// pullRequestMessage is NOT indexed — values are ~1.6KB (template size), risking B-tree key-too-large errors
GithubActionUpdateTask.createIndex({ error: 1 }, { sparse: true, name: "idx_error" }).catch(console.error);
