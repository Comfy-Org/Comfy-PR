#!/usr/bin/env bun
/*
bun index.ts
*/
import type { WithId } from "mongodb";
import "react-hook-form";
import { updateCMNodes, type CMNode } from "./CMNodes";
import { type CRNode } from "./CRNodes";
import { type SlackMsg } from "./SlackMsgs";
import { updateComfyTotals } from "./Totals";
import { getWorkerInstance } from "./WorkerInstances";
import { createComfyRegistryPRsFromCandidates } from "./createComfyRegistryPRsFromCandidates";
import { db } from "./db";
import { type RelatedPull } from "./fetchRelatedPulls";
import { type GithubPull } from "./fetchRepoPRs";
import { gh } from "./gh";
import { notifySlack } from "./notifySlack";
import { updateCMRepos } from "./updateCMRepos";
import { updateCNReposInfo } from "./updateCNReposInfo";
import { updateCNReposPRCandidate } from "./updateCNReposPRCandidate";
import { updateCNReposPulls } from "./updateCNReposPulls";
import { updateCNReposRelatedPulls } from "./updateCNReposRelatedPulls";
import { updateCRRepos } from "./updateCRRepos";
import { updateOutdatedPullsTemplates } from "./updateOutdatedPullsTemplates";
import { type Task } from "./utils/Task";
import { tLog } from "./utils/tLog";

type Email = {
  from?: string;
  title: string;
  body: string;
  to: string;
};

type Sent = {
  slack?: SlackMsg;
  emails?: Email[];
};

type GithubIssueComment = Awaited<ReturnType<typeof gh.issues.getComment>>["data"];
type GithubIssue = Awaited<ReturnType<typeof gh.issues.get>>["data"];
type GithubRepo = Awaited<ReturnType<typeof gh.repos.get>>["data"];
type CRType = "pyproject" | "publichcr";
export type EditedRelatedPull = RelatedPull & { edited: Task<boolean> };

export type CustomNodeRepo = {
  repository: string;
  cr?: WithId<CRNode>;
  cm?: WithId<CMNode>;
  info?: Task<GithubRepo>;
  pulls?: Task<GithubPull[]>;
  crPulls?: Task<(RelatedPull | EditedRelatedPull)[]>;
  candidate?: Task<boolean>;
  // createFork?: Task<GithubRepo>;
  // createBranches?: Task<{ type: CRType; assigned: Worker } & PushedBranch>[];
  createdPulls?: Task<GithubPull[]>;
};
export const CNRepos = db.collection<CustomNodeRepo>("CNRepos");
await CNRepos.createIndex({ repository: 1 }, { unique: true });

if (import.meta.main) {
  await getWorkerInstance("Updating CNRepos");
  // await cacheHealthReport();
  await updateCNRepos();
  // updateCNReposPRTasks
  // await scanCNRepoThenPRs();
  // await pMap(candidates, (e) => updateCNRepoPRStatus(e.repository), { concurrency: 4 });
  // candidates
}
export async function updateCNRepos() {
  await Promise.all([
    tLog("Report Worker Status", async () => {
      const worker = await getWorkerInstance("Comfy PR Bot Running");
      const workerInfo = `${worker.geo.countryCode}/${worker.geo.region}/${worker.geo.city}`;
      const msg = `COMFY-PR BOT RUNNING ${new Date().toISOString()}\nWorker: ${workerInfo}`;
      return [await notifySlack(msg, { unique: true, silent: true })];
    }),
    // stage 1: get repos
    tLog("Update Nodes from ComfyUI Manager", updateCMNodes),
    tLog("Update Repos from ComfyUI Manager", updateCMRepos),
    tLog("Update Repos from ComfyRegistry", updateCRRepos),
    // stage 2: update repo info & pulls
    tLog("Update CNRepos for Repo Infos", updateCNReposInfo),
    tLog("Update CNRepos for Github Pulls", updateCNReposPulls),
    // await tLog("Update Pulls Dashboard", updateCNRepoPullsDashboard),
    // stage 3: update related pulls and comments
    await tLog("Update CNRepos for Related Pulls", updateCNReposRelatedPulls),
    await tLog("Update Outdated Pulls Templates", updateOutdatedPullsTemplates),
    // stage 4: update related comments (if needed)
    // await tLog("date CNRepos for Related Comments", udpateCNReposRelatedComments),
    // stage 5:
    await tLog("Update CNRepos PR Candidates", updateCNReposPRCandidate),
    // stage 6:
    // await tLog("Update CNRepos PRs", scanCNRepoThenCreatePullRequests),
    await tLog("9 Update Comfy Totals", updateComfyTotals),
    await tLog("Create ComfyRegistry PRs", createComfyRegistryPRsFromCandidates),
  ]);
  // await CNRepos.updateMany(
  //   $flatten({ createdPulls: { mdate: $stale("5m"), ...$ERROR } }),
  //   { $unset: { createdPulls: 1 } },
  // );
  // create prs on candidates

  console.log("All repo updated");
}
