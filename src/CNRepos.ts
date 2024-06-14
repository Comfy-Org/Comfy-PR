#!/usr/bin/env bun
/*
bun index.ts
*/
import type { WithId } from "mongodb";
import "react-hook-form";
import { updateCMNodes, type CMNode } from "./CMNodes";
import { type CRNode } from "./CRNodes";
import { type SlackMsg } from "./SlackMsgs";
import { type Task } from "./Task";
import { updateComfyTotals } from "./Totals";
import { getWorker } from "./Worker";
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

type GithubIssueComment = Awaited<
  ReturnType<typeof gh.issues.getComment>
>["data"];
type GithubIssue = Awaited<ReturnType<typeof gh.issues.get>>["data"];
type GithubRepo = Awaited<ReturnType<typeof gh.repos.get>>["data"];
type CRType = "pyproject" | "publichcr";
export type CustomNodeRepo = {
  repository: string;
  cr?: WithId<CRNode>;
  cm?: WithId<CMNode>;
  info?: Task<GithubRepo>;
  pulls?: Task<GithubPull[]>;
  crPulls?: Task<RelatedPull[]>;
  candidate?: Task<boolean>;
  // createFork?: Task<GithubRepo>;
  // createBranches?: Task<{ type: CRType; assigned: Worker } & PushedBranch>[];
  createdPulls?: Task<GithubPull[]>;
};
export const CNRepos = db.collection<CustomNodeRepo>("CNRepos");
await CNRepos.createIndex({ repository: 1 }, { unique: true });

if (import.meta.main) {
  await getWorker("Updating CNRepos");
  // await cacheHealthReport();
  await updateCNRepos();
  // updateCNReposPRTasks
  // await scanCNRepoThenPRs();
  // await pMap(candidates, (e) => updateCNRepoPRStatus(e.repository), { concurrency: 4 });
  // candidates
}
export async function scanCNRepoThenCreatePullRequests() {
  const _candidates = await updateCNReposPRCandidate();
  // const candidates = await pMap(
  //   _candidates,
  //   async ({ repository }) => {
  //     const ghrepo = await gh.repos.get({ ...repoUrlParse(repository) });
  //     return (await CNRepos.findOneAndUpdate(
  //       { repository },
  //       { $set: { archived: ghrepo.data.archived } },
  //       { upsert: true }
  //     ))!;
  //   },
  //   { concurrency: 3 }
  // );

  // await pMap(
  //   shuffleArray(candidates),
  //   async ({ repository, archived }) => {
  //     if (archived) return;
  //     await CNRepos.updateOne(
  //       { repository },
  //       { $set: { prsTask: { state: "pending", stime: new Date() } } }
  //     );
  //     await ComfyRegistryPRs(repository).catch(async (e) => {
  //       await CNRepos.updateOne(
  //         { repository },
  //         {
  //           $set: {
  //             prsTask: { state: "error", mtime: new Date(), error: e.message },
  //           },
  //         }
  //       );
  //       throw e;
  //     });
  //     const prUpdateResult = await updateCNRepoPRStatus(repository);
  //     const links = [prUpdateResult]
  //       .filter((e) => e.modifiedCount || e.upsertedCount)
  //       .flatMap((e) => e.links);
  //     await slackLinksNotify("Custom Node Repo prs created", links);
  //     await CNRepos.updateOne(
  //       { repository },
  //       { $set: { prsTask: { state: "done", mtime: new Date() } } }
  //     );
  //   },
  //   { concurrency: 1, stopOnError: false }
  // );
}

export async function updateCNRepos() {
  await Promise.all([
    tLog("0 Report Worker Status", async () => {
      const worker = await getWorker("Comfy PR Bot Running");
      const workerInfo = `${worker.geo.countryCode}/${worker.geo.region}/${worker.geo.city}`;
      const msg = `COMFY-PR BOT RUNNING ${new Date().toISOString()}\nWorker: ${workerInfo}`;
      return [await notifySlack(msg, { unique: true, silent: true })];
    }),
    // stage 1: get repos
    tLog("1 Update Nodes from ComfyUI Manager", updateCMNodes),
    tLog("1 Update Repos from ComfyUI Manager", updateCMRepos),
    tLog("2 Update Repos from ComfyRegistry", updateCRRepos),
    // stage 2: update repo info & pulls
    tLog("3 Update CNRepos for Repo Infos", updateCNReposInfo),
    tLog("4 Update CNRepos for Github Pulls", updateCNReposPulls),
    // tLog("5 Update Pulls Dashboard", updateCNRepoPullsDashboard),
    // stage 3: update related pulls and comments
    tLog("6 Update CNRepos for Related Pulls", updateCNReposRelatedPulls),
    tLog("7 Update Outdated Pulls Templates", updateOutdatedPullsTemplates),
    // stage 4: update related comments (if needed)
    // tLog("Update CNRepos for Related Comments", udpateCNReposRelatedComments),
    // stage 5:
    tLog("8 Update CNRepos PR Candidates", updateCNReposPRCandidate),
    // stage 6:
    // tLog("Update CNRepos PRs", scanCNRepoThenCreatePullRequests),
    tLog("9 Update Comfy Totals", updateComfyTotals),
    tLog("Create ComfyRegistry PRs", createComfyRegistryPRsFromCandidates),
  ]);
  // await CNRepos.updateMany(
  //   $flatten({ createdPulls: { mdate: $stale("5m"), ...$ERROR } }),
  //   { $unset: { createdPulls: 1 } },
  // );
  // create prs on candidates

  console.log("All repo updated");
}
