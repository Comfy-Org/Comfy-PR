/**
 * QA CLI handlers — called from bot/cli.ts `prbot qa` command group.
 */

import { randomUUID } from "crypto";
import { runQA } from "./orchestrator";
import type { QATask, QAType } from "./types";

interface ReproduceArgs {
  issue: string; // "owner/repo#123"
  branch?: string;
  postSlack?: string;
  timeout?: number;
}

/** Parse "owner/repo#123" into { repo, number }. */
function parseIssueRef(ref: string): { repo: string; number: number } {
  const match = ref.match(/^([^#]+)#(\d+)$/);
  if (!match) throw new Error(`Invalid issue reference: "${ref}". Expected format: owner/repo#123`);
  return { repo: match[1], number: parseInt(match[2], 10) };
}

/** Fetch issue/PR details from GitHub API. */
async function fetchIssueDetails(repo: string, number: number) {
  const { $ } = await import("bun");
  const ghToken = process.env.GH_TOKEN_COMFY_PR_BOT || process.env.GH_TOKEN || "";
  const result = await $`GH_TOKEN=${ghToken} gh api repos/${repo}/issues/${number}`.text();
  return JSON.parse(result) as { title: string; body: string; pull_request?: unknown; head?: { ref: string }; base?: { ref: string } };
}

export async function handleReproduce(args: ReproduceArgs) {
  const { repo, number } = parseIssueRef(args.issue);
  const details = await fetchIssueDetails(repo, number);

  const task: QATask = {
    runId: randomUUID(),
    type: "reproduce",
    repo,
    branch: args.branch || "main",
    issueNumber: number,
    issueTitle: details.title,
    issueBody: details.body,
    postGitHub: true,
    postSlackChannel: args.postSlack,
  };

  return runQA(task);
}

interface VerifyArgs {
  pr: string; // "owner/repo#123"
  base?: string;
  head?: string;
  postSlack?: string;
}

export async function handleVerify(args: VerifyArgs) {
  const { repo, number } = parseIssueRef(args.pr);
  const details = await fetchIssueDetails(repo, number);

  // Fetch PR-specific info (head/base branches)
  const { $ } = await import("bun");
  const ghToken = process.env.GH_TOKEN_COMFY_PR_BOT || process.env.GH_TOKEN || "";
  let headBranch = args.head || "main";
  let baseBranch = args.base || "main";

  try {
    const prJson = await $`GH_TOKEN=${ghToken} gh api repos/${repo}/pulls/${number}`.text();
    const prData = JSON.parse(prJson);
    headBranch = args.head || prData.head?.ref || "main";
    baseBranch = args.base || prData.base?.ref || "main";
  } catch {
    // fallback to args
  }

  const task: QATask = {
    runId: randomUUID(),
    type: "verify",
    repo,
    branch: headBranch,
    prNumber: number,
    prTitle: details.title,
    prBody: details.body,
    baseBranch,
    postGitHub: true,
    postSlackChannel: args.postSlack,
  };

  return runQA(task);
}

interface SmokeArgs {
  repo: string;
  branch?: string;
  postSlack?: string;
}

export async function handleSmoke(args: SmokeArgs) {
  const task: QATask = {
    runId: randomUUID(),
    type: "smoke",
    repo: args.repo,
    branch: args.branch || "main",
    postGitHub: false,
    postSlackChannel: args.postSlack,
  };

  return runQA(task);
}

interface DemoArgs {
  repo: string;
  branch?: string;
  prompt: string;
  postSlack?: string;
  postGitHub?: string; // "owner/repo#123"
}

export async function handleDemo(args: DemoArgs) {
  const task: QATask = {
    runId: randomUUID(),
    type: "demo",
    repo: args.repo,
    branch: args.branch || "main",
    prompt: args.prompt,
    postGitHub: false,
    postSlackChannel: args.postSlack,
  };

  if (args.postGitHub) {
    const { number } = parseIssueRef(args.postGitHub);
    task.issueNumber = number;
    task.postGitHub = true;
  }

  return runQA(task);
}

interface RunArgs {
  repo: string;
  branch?: string;
  prompt: string;
  postSlack?: string;
  postGitHub?: string;
}

export async function handleRun(args: RunArgs) {
  const task: QATask = {
    runId: randomUUID(),
    type: "run",
    repo: args.repo,
    branch: args.branch || "main",
    prompt: args.prompt,
    postGitHub: false,
    postSlackChannel: args.postSlack,
  };

  if (args.postGitHub) {
    const { number } = parseIssueRef(args.postGitHub);
    task.issueNumber = number;
    task.postGitHub = true;
  }

  return runQA(task);
}
