import { updateCMNodes } from "./CMNodes";
import { updateComfyTotals } from "./Totals";
import { getWorkerInstance } from "./WorkerInstances";
import { createComfyRegistryPRsFromCandidates } from "./createComfyRegistryPRsFromCandidates";
import { notifySlack } from "./notifySlack";
import { updateCMRepos } from "./updateCMRepos";
import { updateCNReposInfo } from "./updateCNReposInfo";
import { updateCNReposPRCandidate } from "./updateCNReposPRCandidate";
import { updateCNReposPulls } from "./updateCNReposPulls";
import { updateCNRepoPullsDashboard } from "./updateCNReposPullsDashboard";
import { updateCNReposRelatedPulls } from "./updateCNReposRelatedPulls";
import { updateCRRepos } from "./updateCRRepos";
import { updateOutdatedPullsTemplates } from "./updateOutdatedPullsTemplates";
import { updateCNReposCRPullsComments } from "./updateCNReposCRPullsComments";
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
    tLog("Update Pulls Dashboard", updateCNRepoPullsDashboard),
    // stage 3: update related pulls and comments
    tLog("Update CNRepos for Related Pulls", updateCNReposRelatedPulls),
    tLog("Update Outdated Pulls Templates", updateOutdatedPullsTemplates),
    // stage 4: update related comments
     tLog("Update CNRepos for Related Comments", updateCNReposCRPullsComments) ,
    // stage 5: mark and create PRs
    tLog("Update CNRepos PR Candidates", updateCNReposPRCandidate),
    tLog("Create ComfyRegistry PRs", createComfyRegistryPRsFromCandidates),
    // final
    tLog("Update Comfy Totals", updateComfyTotals),
  ]);

  console.log("All repo updated");
}
