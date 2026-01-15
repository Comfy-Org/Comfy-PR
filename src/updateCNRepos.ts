import { updateCMNodes } from "./CMNodes";
import { getWorkerInstance } from "./WorkerInstances";
import { createComfyRegistryPRsFromCandidates } from "./createComfyRegistryPRsFromCandidates";
import { notifySlack } from "@/lib/slack/notifySlack";
import { updateCMRepos } from "./updateCMRepos";
import { updateCNReposCRPullsComments } from "./updateCNReposCRPullsComments";
import { updateCNReposInfo } from "./updateCNReposInfo";
import { updateCNReposPRCandidate } from "./updateCNReposPRCandidate";
import { updateCNReposPulls } from "./updateCNReposPulls";
import { updateCNRepoPullsDashboard } from "./updateCNReposPullsDashboard";
import { updateCNReposRelatedPulls } from "./updateCNReposRelatedPulls";
import { updateCRNodes } from "./updateCRNodes";
import { updateCRRepos } from "./updateCRRepos";
import { updateComfyTotals } from "./updateComfyTotals";
import { updateOutdatedPullsTemplates } from "./updateOutdatedPullsTemplates";
import { tLog } from "./utils/tLog";

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
      const worker = await getWorkerInstance("ComfyPR Bot Running");
      const workerInfo = `${worker.geo.countryCode}/${worker.geo.region}/${worker.geo.city}`;
      const msg = `COMFY-PR BOT RUNNING ${new Date().toISOString()}\nWorker: ${workerInfo}`;
      return [await notifySlack(msg, { unique: true, silent: true })];
    }),
    // stage 1: get repos
    await tLog("Update Nodes from ComfyUI Manager", updateCMNodes),
    await tLog("Update Repos from ComfyUI Manager", updateCMRepos),
    await tLog("Update Nodes from ComfyRegistry", updateCRNodes),
    await tLog("Update Repos from ComfyRegistry", updateCRRepos),
    // stage 2: update repo info & pulls
    await tLog("Update CNRepos for Repo Infos", updateCNReposInfo),
    await tLog("Update CNRepos for Github Pulls", updateCNReposPulls),
    await tLog("Update Pulls Dashboard", updateCNRepoPullsDashboard),
    // stage 3: update related pulls and comments
    await tLog("Update CNRepos for Related Pulls", updateCNReposRelatedPulls),
    await tLog("Update Outdated Pulls Templates", updateOutdatedPullsTemplates),
    // stage 4: update related comments
    await tLog("Update CNRepos for Related Comments", updateCNReposCRPullsComments),
    // stage 5: mark and create PRs
    await tLog("Update CNRepos PR Candidates", updateCNReposPRCandidate),
    await tLog("Create ComfyRegistry PRs", createComfyRegistryPRsFromCandidates),
    // final
    await tLog("Update Comfy Totals", updateComfyTotals),
  ]);

  console.log("All repo updated");
}
