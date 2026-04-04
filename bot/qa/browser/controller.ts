/**
 * Browser controller — launches Playwright, manages context/page,
 * injects a visible cursor overlay for video recordings.
 */

import type { Browser, BrowserContext, Page } from "playwright";
import { QA_CONFIG } from "../config";

export interface BrowserController {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Collected console errors during the session. */
  consoleErrors: string[];
  /** Collected failed network requests. */
  networkErrors: string[];
  /** Close everything. */
  close: () => Promise<void>;
}

const CURSOR_OVERLAY_CSS = `
  #qa-cursor {
    position: fixed; z-index: 2147483647;
    width: 20px; height: 20px;
    background: rgba(255, 50, 50, 0.7);
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    pointer-events: none;
    transform: translate(-50%, -50%);
    transition: left 0.08s ease, top 0.08s ease;
    box-shadow: 0 0 8px rgba(255, 50, 50, 0.4);
  }
`;

const CURSOR_OVERLAY_JS = `
  (() => {
    if (document.getElementById('qa-cursor')) return;
    const dot = document.createElement('div');
    dot.id = 'qa-cursor';
    document.body.appendChild(dot);
    document.addEventListener('mousemove', (e) => {
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';
    }, true);
  })();
`;

export interface LaunchOptions {
  /** Directory to store video recordings. */
  videoDir: string;
  /** Whether to run headed (visible browser). Default: true for video. */
  headed?: boolean;
  /** Base URL to navigate to initially. */
  baseUrl?: string;
}

/**
 * Launch a browser with video recording and cursor overlay ready.
 */
export async function launchBrowser(options: LaunchOptions): Promise<BrowserController> {
  const { videoDir, headed = true, baseUrl } = options;
  const { width, height } = QA_CONFIG.video;

  // Dynamic import — playwright may not be installed yet
  const pw = await import("playwright");

  const browser = await pw.chromium.launch({
    headless: !headed,
    args: [
      `--window-size=${width},${height}`,
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width, height } },
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: "en-US",
  });

  const page = await context.newPage();

  // Collect errors
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("requestfailed", (req) => {
    networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "unknown"}`);
  });

  // Inject cursor overlay after every navigation
  const injectCursor = async () => {
    try {
      await page.addStyleTag({ content: CURSOR_OVERLAY_CSS });
      await page.evaluate(CURSOR_OVERLAY_JS);
    } catch {
      // page might have been closed
    }
  };

  page.on("load", injectCursor);

  // Navigate to base URL if provided
  if (baseUrl) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: QA_CONFIG.timeouts.appBoot });
    await injectCursor();
  }

  const close = async () => {
    await context.close(); // this finalizes the video
    await browser.close();
  };

  return { browser, context, page, consoleErrors, networkErrors, close };
}
