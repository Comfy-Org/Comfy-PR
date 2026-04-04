/**
 * QA Agent — AI-driven browser automation agent.
 *
 * Reads an issue/PR description, reasons about reproduction steps,
 * drives a browser via Playwright, and produces a verdict with evidence.
 */

import type { Page } from "playwright";
import type { QATask, QAResult, Verdict, ReproducedBy, QAEvidence } from "./types";
import type { RecordingSession } from "./browser/recorder";
import { QA_CONFIG } from "./config";

interface AgentContext {
  task: QATask;
  page: Page;
  recorder: RecordingSession;
  consoleErrors: string[];
  networkErrors: string[];
  baseUrl: string;
}

/**
 * Build the system prompt for the QA agent based on task type.
 */
function buildSystemPrompt(task: QATask): string {
  const base = `You are a QA engineer performing automated testing on a web application.
You have access to a browser page. You can interact with it by returning structured actions.

RULES:
- Use retrying assertions (check multiple times) instead of fixed waits
- Write ONE focused test per issue — do not write multiple tests
- Assertions must be specific to the bug/feature — not just "element exists"
- If you cannot find a bug-specific assertion, verdict must be NOT_REPRODUCIBLE
- Maximum ${QA_CONFIG.agent.maxIterations} actions before you must give a verdict
- Take screenshots at key moments (before/after the bug trigger)
`;

  switch (task.type) {
    case "reproduce":
      return `${base}
TASK: Reproduce a reported bug.
Issue #${task.issueNumber}: ${task.issueTitle}

${task.issueBody ?? "(no description)"}

Steps:
1. Navigate to the relevant page
2. Follow the reproduction steps from the issue
3. Verify the bug occurs
4. Take a screenshot of the broken behavior
5. Give verdict: REPRODUCED (with evidence) or NOT_REPRODUCIBLE
`;

    case "verify":
      return `${base}
TASK: Verify that a PR fixes a reported issue.
PR #${task.prNumber}: ${task.prTitle}

${task.prBody ?? "(no description)"}

Steps:
1. Navigate to the area affected by the PR
2. Test the fix described in the PR
3. Verify the bug no longer occurs
4. Check for regressions in related functionality
5. Give verdict: VERIFIED or REGRESSION
`;

    case "smoke":
      return `${base}
TASK: Perform a smoke test of the application.
Test key user journeys:
1. Page loads correctly
2. Main navigation works
3. Core features are functional
4. No console errors on critical paths
5. Give verdict: VERIFIED (all pass) or REGRESSION (failures found)
`;

    case "demo":
      return `${base}
TASK: Record a demo of a feature.
${task.prompt ?? "Explore the main features of the application."}

Steps:
1. Navigate through the feature
2. Take screenshots at key moments
3. Demonstrate the feature working
4. Give verdict: DEMO_COMPLETE
`;

    case "run":
      return `${base}
TASK: ${task.prompt ?? "Explore the application and report findings."}

Follow the instructions and give an appropriate verdict.
`;
  }
}

/** Actions the agent can take. */
export type AgentAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "press"; key: string }
  | { type: "hover"; selector: string }
  | { type: "screenshot"; name: string }
  | { type: "wait"; selector: string; state: "visible" | "hidden" | "attached" }
  | { type: "evaluate"; script: string }
  | { type: "scroll"; direction: "up" | "down"; amount: number }
  | { type: "done"; verdict: Verdict; summary: string; details: string; reproducedBy: ReproducedBy };

/**
 * Execute a single agent action on the page.
 * Returns a textual description of the result for the agent's context.
 */
async function executeAction(page: Page, action: AgentAction, recorder: RecordingSession): Promise<string> {
  try {
    switch (action.type) {
      case "navigate":
        await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        return `Navigated to ${action.url}. Title: "${await page.title()}"`;

      case "click":
        await page.click(action.selector, { timeout: 10_000 });
        return `Clicked "${action.selector}"`;

      case "fill":
        await page.fill(action.selector, action.value, { timeout: 10_000 });
        return `Filled "${action.selector}" with "${action.value}"`;

      case "press":
        await page.keyboard.press(action.key);
        return `Pressed key "${action.key}"`;

      case "hover":
        await page.hover(action.selector, { timeout: 10_000 });
        return `Hovered over "${action.selector}"`;

      case "screenshot": {
        const s = await recorder.screenshot(action.name);
        return `Screenshot saved: ${s.name} (at ${s.timestamp}ms)`;
      }

      case "wait":
        await page.waitForSelector(action.selector, { state: action.state, timeout: 15_000 });
        return `Waited for "${action.selector}" to be ${action.state}`;

      case "evaluate": {
        const result = await page.evaluate(action.script);
        return `Evaluated script. Result: ${JSON.stringify(result).slice(0, 500)}`;
      }

      case "scroll":
        await page.mouse.wheel(0, action.direction === "down" ? action.amount : -action.amount);
        return `Scrolled ${action.direction} by ${action.amount}px`;

      case "done":
        return `DONE — Verdict: ${action.verdict}`;

      default:
        return `Unknown action type`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `ERROR: ${msg}`;
  }
}

/**
 * Get a snapshot of the page state for the agent to reason about.
 */
async function getPageSnapshot(page: Page): Promise<string> {
  const title = await page.title().catch(() => "(unknown)");
  const url = page.url();

  let a11yTree = "";
  try {
    const snapshot = await page.accessibility.snapshot();
    a11yTree = snapshot ? JSON.stringify(snapshot, null, 2).slice(0, 4000) : "(empty a11y tree)";
  } catch {
    a11yTree = "(a11y snapshot failed)";
  }

  return `--- Page State ---
URL: ${url}
Title: ${title}
Accessibility Tree (truncated):
${a11yTree}
---`;
}

/**
 * Run the QA agent loop.
 *
 * Uses Anthropic Claude to decide actions, executes them on the browser,
 * and loops until the agent issues a "done" action or hits the iteration limit.
 */
export async function runQAAgent(ctx: AgentContext): Promise<QAResult> {
  const { task, page, recorder, consoleErrors, networkErrors, baseUrl } = ctx;
  const startTime = Date.now();

  const systemPrompt = buildSystemPrompt(task);
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Initial state
  const initialSnapshot = await getPageSnapshot(page);
  messages.push({
    role: "user",
    content: `${systemPrompt}\n\nThe app is running at ${baseUrl}.\n\n${initialSnapshot}\n\nDecide your first action. Respond with a JSON action object.`,
  });

  let finalVerdict: Verdict = "INCONCLUSIVE";
  let finalSummary = "Agent did not reach a verdict within the iteration limit.";
  let finalDetails = "";
  let finalReproducedBy: ReproducedBy = "none";

  for (let i = 0; i < QA_CONFIG.agent.maxIterations; i++) {
    // Call AI to decide next action
    const aiResponse = await callAgent(messages);
    messages.push({ role: "assistant", content: aiResponse });

    // Parse action from response
    const action = parseAction(aiResponse);
    if (!action) {
      messages.push({ role: "user", content: "Could not parse your action. Please respond with a valid JSON action object." });
      continue;
    }

    // Check for done
    if (action.type === "done") {
      finalVerdict = action.verdict;
      finalSummary = action.summary;
      finalDetails = action.details;
      finalReproducedBy = action.reproducedBy;
      break;
    }

    // Execute action
    const result = await executeAction(page, action, recorder);
    const snapshot = await getPageSnapshot(page);
    messages.push({ role: "user", content: `Action result: ${result}\n\n${snapshot}\n\nDecide your next action.` });

    // Timeout check
    if (Date.now() - startTime > QA_CONFIG.timeouts.totalRun) {
      finalSummary = "Agent timed out before reaching a verdict.";
      break;
    }
  }

  // Finalize recording
  const video = await recorder.stop();

  const evidence: QAEvidence = {
    videos: video ? [video] : [],
    screenshots: [], // populated via recorder
    consoleErrors: [...consoleErrors],
    networkErrors: [...networkErrors],
  };

  return {
    task,
    verdict: finalVerdict,
    summary: finalSummary,
    details: finalDetails,
    reproducedBy: finalReproducedBy,
    evidence,
    durationMs: Date.now() - startTime,
    artifactsDir: "",
  };
}

/**
 * Call the AI agent to decide the next action.
 * Uses Anthropic Claude via the AI SDK (already a dependency).
 */
async function callAgent(messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<string> {
  const { generateText } = await import("ai");
  const { createAnthropic } = await import("@ai-sdk/anthropic");

  const anthropic = createAnthropic();

  const { text } = await generateText({
    model: anthropic(QA_CONFIG.agent.model),
    system: `You are a QA automation agent. Respond with a single JSON action object per turn.

Available actions:
  {"type":"navigate","url":"..."}
  {"type":"click","selector":"..."}
  {"type":"fill","selector":"...","value":"..."}
  {"type":"press","key":"..."}
  {"type":"hover","selector":"..."}
  {"type":"screenshot","name":"..."}
  {"type":"wait","selector":"...","state":"visible|hidden|attached"}
  {"type":"evaluate","script":"..."}
  {"type":"scroll","direction":"up|down","amount":300}
  {"type":"done","verdict":"REPRODUCED|NOT_REPRODUCIBLE|VERIFIED|REGRESSION|INCONCLUSIVE|DEMO_COMPLETE","summary":"...","details":"...","reproducedBy":"e2e_test|video|both|none"}

Respond ONLY with the JSON object, no markdown fences or extra text.`,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    maxTokens: 1024,
  });

  return text;
}

/**
 * Extract a JSON action from the agent's response text.
 */
function parseAction(text: string): AgentAction | null {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed && typeof parsed.type === "string") {
      return parsed as AgentAction;
    }
    return null;
  } catch {
    return null;
  }
}
