/**
 * Video recording helpers — wraps Playwright's built-in recording
 * and adds screenshot capture utilities.
 */

import { mkdir } from "fs/promises";
import { statSync } from "fs";
import path from "path";
import type { Page } from "playwright";
import type { ScreenshotArtifact, VideoArtifact } from "../types";

export interface RecordingSession {
  /** Capture a named screenshot. */
  screenshot: (name: string) => Promise<ScreenshotArtifact>;
  /** Stop recording and return video artifact info. */
  stop: () => Promise<VideoArtifact | null>;
}

/**
 * Create a recording session tied to a Playwright page.
 * Video recording is started by the BrowserContext (see controller.ts).
 * This helper tracks screenshots and finalizes the video path.
 */
export async function createRecordingSession(
  page: Page,
  artifactsDir: string,
): Promise<RecordingSession> {
  const screenshotsDir = path.join(artifactsDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const startTime = Date.now();
  const screenshots: ScreenshotArtifact[] = [];
  let screenshotCounter = 0;

  const screenshot = async (name: string): Promise<ScreenshotArtifact> => {
    screenshotCounter++;
    const filename = `${String(screenshotCounter).padStart(3, "0")}-${name}.png`;
    const filepath = path.join(screenshotsDir, filename);
    await page.screenshot({ path: filepath, fullPage: false });

    const artifact: ScreenshotArtifact = {
      path: filepath,
      name,
      timestamp: Date.now() - startTime,
    };
    screenshots.push(artifact);
    return artifact;
  };

  const stop = async (): Promise<VideoArtifact | null> => {
    const video = page.video();
    if (!video) return null;

    const videoPath = await video.path();
    if (!videoPath) return null;

    // Wait a moment for the video to be finalized
    await new Promise((r) => setTimeout(r, 500));

    try {
      const stat = statSync(videoPath);
      return {
        path: videoPath,
        name: path.basename(videoPath),
        sizeBytes: stat.size,
        durationSeconds: undefined, // would need ffprobe
      };
    } catch {
      return null;
    }
  };

  return { screenshot, stop };
}
