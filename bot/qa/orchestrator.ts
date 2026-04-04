/**
 * QA Orchestrator — top-level entry point for QA runs.
 *
 * Parses task → clones repo → detects bootstrap → boots app →
 * launches browser → runs agent → collects results → dispatches reports.
 */

import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { QA_CONFIG } from "./config";
import { detectBootstrap } from "./bootstrap";
import { launchBrowser } from "./browser/controller";
import { createRecordingSession } from "./browser/recorder";
import { runQAAgent } from "./qa-agent";
import { generateReport } from "./report/generator";
import { postGitHubComment } from "./report/github-commenter";
import type { QATask, QAResult } from "./types";

/**
 * Run a complete QA session from task definition to report delivery.
 */
export async function runQA(task: QATask): Promise<QAResult> {
  const runId = task.runId || randomUUID();
  task.runId = runId;

  const runDir = path.join(QA_CONFIG.paths.qaRunsDir, runId);
  const repoDir = path.join(runDir, "repo");
  const artifactsDir = path.join(runDir, "artifacts");
  const videosDir = path.join(artifactsDir, "videos");

  await mkdir(videosDir, { recursive: true });

  console.log(`[QA] Starting run ${runId} — ${task.type} on ${task.repo}`);

  // 1. Clone the repo
  console.log(`[QA] Cloning ${task.repo}@${task.branch}...`);
  await cloneRepo(task.repo, task.branch, repoDir);

  // 2. Detect bootstrap
  console.log(`[QA] Detecting app type...`);
  const bootstrap = await detectBootstrap(repoDir);
  console.log(`[QA] Detected: ${bootstrap.name}`);

  // 3. Install dependencies
  console.log(`[QA] Installing dependencies...`);
  await bootstrap.install(repoDir);

  // 4. Start the app
  console.log(`[QA] Starting dev server...`);
  const app = await bootstrap.start(repoDir);
  const baseUrl = app.baseUrl;

  try {
    // 5. Wait for ready
    console.log(`[QA] Waiting for app at ${baseUrl}...`);
    await waitForReady(baseUrl, bootstrap);

    // 6. Launch browser with recording
    console.log(`[QA] Launching browser...`);
    const browserCtrl = await launchBrowser({ videoDir: videosDir, baseUrl });

    try {
      // 7. Create recording session
      const recorder = await createRecordingSession(browserCtrl.page, artifactsDir);

      // 8. Run the QA agent
      console.log(`[QA] Running agent (${task.type})...`);
      const result = await runQAAgent({
        task,
        page: browserCtrl.page,
        recorder,
        consoleErrors: browserCtrl.consoleErrors,
        networkErrors: browserCtrl.networkErrors,
        baseUrl,
      });

      result.artifactsDir = artifactsDir;

      // 9. Generate report
      console.log(`[QA] Generating report...`);
      const reportPath = path.join(runDir, "report.md");
      await generateReport(result, reportPath);

      // 10. Post to GitHub if requested
      if (task.postGitHub !== false && (task.issueNumber || task.prNumber)) {
        console.log(`[QA] Posting to GitHub...`);
        await postGitHubComment(result).catch((err) => {
          console.error(`[QA] Failed to post GitHub comment: ${err}`);
        });
      }

      console.log(`[QA] Run ${runId} complete — verdict: ${result.verdict}`);
      return result;
    } finally {
      await browserCtrl.close();
    }
  } finally {
    await app.cleanup();
  }
}

/**
 * Clone a repo to a target directory.
 */
async function cloneRepo(repo: string, branch: string, targetDir: string) {
  if (existsSync(targetDir)) {
    console.log(`[QA] Repo already exists at ${targetDir}, pulling...`);
    const { $ } = await import("bun");
    await $`cd ${targetDir} && git fetch origin ${branch} && git checkout ${branch} && git pull origin ${branch}`.quiet();
    return;
  }

  const ghToken = process.env.GH_TOKEN_COMFY_PR_BOT || process.env.GH_TOKEN;
  const { $ } = await import("bun");

  if (ghToken) {
    await $`GH_TOKEN=${ghToken} gh repo clone ${repo} ${targetDir} -- --single-branch --branch ${branch}`;
  } else {
    await $`git clone --single-branch --branch ${branch} https://github.com/${repo}.git ${targetDir}`;
  }
}

/**
 * Poll the app URL until it responds 200, or timeout.
 */
async function waitForReady(
  url: string,
  bootstrap: { readyCheck: (url: string) => Promise<boolean> },
) {
  const deadline = Date.now() + QA_CONFIG.timeouts.readyCheck;

  while (Date.now() < deadline) {
    if (await bootstrap.readyCheck(url)) {
      console.log(`[QA] App is ready at ${url}`);
      return;
    }
    await new Promise((r) => setTimeout(r, QA_CONFIG.timeouts.readyPollInterval));
  }

  throw new Error(`App at ${url} did not become ready within ${QA_CONFIG.timeouts.readyCheck / 1000}s`);
}
