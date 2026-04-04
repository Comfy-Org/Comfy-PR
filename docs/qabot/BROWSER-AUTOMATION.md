# QA Bot — Browser Automation Strategy

## Overview

QA Bot uses **Playwright** as its browser automation engine, driven by an **AI agent** that can reason about what to do next based on the page's accessibility tree, screenshots, and the bug/feature description.

---

## Two-Layer Architecture

### Layer 1: AI Agent (Decision Making)

The AI agent reads the issue/PR, understands what needs to be tested, and generates actions:

```
Issue: "Sampler preview disappears when switching tabs"

Agent reasoning:
  1. Open ComfyUI → navigate to sampler node
  2. Trigger preview → verify preview visible
  3. Switch to another tab → switch back
  4. Assert: preview should still be visible
  5. If preview gone → BUG REPRODUCED ✓
```

### Layer 2: Playwright (Action Execution)

The agent's decisions are executed via Playwright commands:

```typescript
// Agent generates structured actions
type BrowserAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'screenshot'; name: string }
  | { type: 'wait'; selector: string; state: 'visible' | 'hidden' }
  | { type: 'assert'; selector: string; expected: string }
  | { type: 'keyboard'; key: string }
  | { type: 'drag'; from: string; to: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount: number };
```

---

## Agent Tools (MCP-style)

The QA agent has these tools available during execution:

### Navigation & Interaction

```typescript
tools = {
  // Page inspection
  getAccessibilityTree: () => string,       // Get page a11y tree for navigation
  getPageScreenshot: () => Buffer,           // Screenshot current state
  getConsoleErrors: () => string[],          // Browser console errors
  getNetworkErrors: () => NetworkError[],    // Failed network requests

  // Actions
  click: (selector: string) => void,
  type: (selector: string, text: string) => void,
  press: (key: string) => void,
  hover: (selector: string) => void,
  drag: (from: string, to: string) => void,
  scroll: (direction: string, amount: number) => void,
  navigate: (url: string) => void,
  waitFor: (selector: string, options: WaitOptions) => void,

  // Evidence collection
  screenshot: (name: string) => string,     // Returns path
  startRecording: () => void,
  stopRecording: () => string,              // Returns video path

  // Test execution
  runTest: (code: string) => TestResult,    // Run Playwright test code
  
  // Verdict
  done: (verdict: Verdict) => void,         // Finish with verdict
};
```

### Verdict Types

```typescript
type Verdict =
  | 'REPRODUCED'        // Bug confirmed with evidence
  | 'NOT_REPRODUCIBLE'  // Bug could not be reproduced
  | 'VERIFIED'          // PR changes work as expected
  | 'REGRESSION'        // PR introduces a regression
  | 'INCONCLUSIVE'      // Could not determine (timeout, error, etc.)
  | 'DEMO_COMPLETE';    // Demo video recorded successfully

interface VerdictResult {
  verdict: Verdict;
  summary: string;              // One-line summary
  details: string;              // Detailed findings
  reproducedBy: 'e2e_test' | 'video' | 'both' | 'none';
  evidence: {
    videos: string[];           // Video file paths
    screenshots: string[];     // Screenshot file paths
    testCode?: string;         // E2E test source
    consoleErrors?: string[];  // Relevant console errors
  };
}
```

---

## Navigation Strategy

### Accessibility Tree First

The AI agent primarily navigates using the accessibility tree, which is framework-agnostic:

```typescript
const a11yTree = await page.accessibility.snapshot();
// Returns structured tree:
// - role: "main"
//   - role: "navigation"
//     - role: "link", name: "Templates"
//     - role: "link", name: "Settings"
//   - role: "canvas", name: "Node Editor"
```

### Fallback: Visual (Screenshot + AI Vision)

When a11y tree is insufficient (e.g., canvas-based UIs like ComfyUI's node editor):

```typescript
// Take screenshot → send to vision model → get coordinates
const screenshot = await page.screenshot();
const clickTarget = await visionModel.findElement(screenshot, "the add node button");
await page.mouse.click(clickTarget.x, clickTarget.y);
```

### ComfyUI-Specific Navigation

ComfyUI's canvas uses LiteGraph which doesn't have standard DOM elements. Special handling:

```typescript
// ComfyUI canvas interactions
const comfyHelpers = {
  addNode: async (nodeName: string) => {
    await page.keyboard.press('Space');           // Open search
    await page.fill('[placeholder="Search"]', nodeName);
    await page.click(`text="${nodeName}"`);
  },
  connectNodes: async (from: string, to: string) => {
    // Use ComfyUI's API to create connections programmatically
    await page.evaluate(({ from, to }) => {
      // LiteGraph API
    }, { from, to });
  },
  runWorkflow: async () => {
    await page.click('[aria-label="Queue Prompt"]');
  },
};
```

---

## Test Writing Strategy

### Agent-Written Tests

The AI agent writes Playwright tests dynamically based on the issue:

```typescript
// Agent generates test code like:
const testCode = `
  test('Sampler preview persists after tab switch', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Setup: Add sampler node and trigger preview
    await page.click('[data-node-type="KSampler"]');
    await expect(page.locator('.preview-image')).toBeVisible();

    // Action: Switch tabs and come back
    const newPage = await page.context().newPage();
    await newPage.goto('about:blank');
    await page.bringToFront();

    // Assert: Preview should still be visible
    await expect(page.locator('.preview-image')).toBeVisible();
  });
`;
```

### Test Quality Rules

1. **Assertions must be specific to the bug** — not just `count > 0`
2. **Use retrying assertions** — `await expect(...).toBeVisible()` not `waitForTimeout`
3. **One focused test per issue** — don't write multiple tests
4. **Include setup/teardown** — clean state before each test
5. **Timeout budget** — max 60 seconds per test

---

## Error Handling

### App Not Starting

```typescript
const maxRetries = 3;
for (let i = 0; i < maxRetries; i++) {
  try {
    await bootstrap.start(repoDir);
    await bootstrap.readyCheck(baseUrl);
    break;
  } catch (error) {
    if (i === maxRetries - 1) {
      return { verdict: 'INCONCLUSIVE', reason: 'App failed to start' };
    }
    await sleep(5000);
  }
}
```

### Browser Crashes

```typescript
page.on('crash', async () => {
  // Save whatever we have so far
  await recorder.stop();
  // Report partial results
  return { verdict: 'INCONCLUSIVE', reason: 'Browser crashed during test' };
});
```

### Flaky Tests

If a test fails on first run, retry up to 2 times before declaring verdict:

```typescript
const maxTestRetries = 2;
let lastResult: TestResult;
for (let i = 0; i <= maxTestRetries; i++) {
  lastResult = await runTest(testCode);
  if (lastResult.passed) break;
}
```
