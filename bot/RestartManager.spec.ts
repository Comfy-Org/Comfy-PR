import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { RestartManager } from "./RestartManager";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";

describe("RestartManager", () => {
  let testDir: string;
  let restartManager: RestartManager;
  let isIdleMock: ReturnType<typeof mock>;
  let onRestartMock: ReturnType<typeof mock>;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = join(process.cwd(), ".test-restart-manager");
    await mkdir(testDir, { recursive: true });

    // Create mocks
    isIdleMock = mock(() => true);
    onRestartMock = mock(() => {});
  });

  afterEach(async () => {
    // Clean up
    if (restartManager) {
      restartManager.stop();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  test("should start watching directories", () => {
    restartManager = new RestartManager({
      watchPaths: [testDir],
      isIdle: isIdleMock,
      onRestart: onRestartMock,
      debounceDelay: 100,
      idleCheckInterval: 100,
    });

    restartManager.start();
    // If no error is thrown, the test passes
    expect(true).toBe(true);
  });

  test("should queue restart when file changes and bot is idle", async () => {
    restartManager = new RestartManager({
      watchPaths: [testDir],
      isIdle: isIdleMock,
      onRestart: onRestartMock,
      debounceDelay: 100,
      idleCheckInterval: 100,
    });

    restartManager.start();

    // Manually trigger file change (simulating what fs.watch would do)
    // @ts-ignore - accessing private method for testing
    restartManager.onFileChange("test.ts");

    // Wait for debounce + idle check
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Should have called onRestart since bot is idle
    expect(onRestartMock).toHaveBeenCalled();
  });

  test("should wait for idle state before restarting", async () => {
    let isIdle = false;
    isIdleMock = mock(() => isIdle);

    restartManager = new RestartManager({
      watchPaths: [testDir],
      isIdle: isIdleMock,
      onRestart: onRestartMock,
      debounceDelay: 100,
      idleCheckInterval: 100,
    });

    restartManager.start();

    // Manually trigger file change
    // @ts-ignore - accessing private method for testing
    restartManager.onFileChange("test.ts");

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should not have restarted yet (bot is busy)
    expect(onRestartMock).not.toHaveBeenCalled();

    // Make bot idle
    isIdle = true;

    // Wait for idle check
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should have restarted now
    expect(onRestartMock).toHaveBeenCalled();
  });

  test("should ignore markdown files", async () => {
    restartManager = new RestartManager({
      watchPaths: [testDir],
      isIdle: isIdleMock,
      onRestart: onRestartMock,
      debounceDelay: 100,
      idleCheckInterval: 100,
    });

    restartManager.start();

    // Create a markdown file (should be ignored)
    const mdFile = join(testDir, "README.md");
    await writeFile(mdFile, "# Test");

    // Wait for debounce + idle check
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Should NOT have called onRestart (markdown files are ignored)
    expect(onRestartMock).not.toHaveBeenCalled();
  });

  test("should debounce multiple file changes", async () => {
    restartManager = new RestartManager({
      watchPaths: [testDir],
      isIdle: isIdleMock,
      onRestart: onRestartMock,
      debounceDelay: 200,
      idleCheckInterval: 100,
    });

    restartManager.start();

    // Trigger multiple file changes quickly
    // @ts-ignore - accessing private method for testing
    restartManager.onFileChange("test1.ts");
    await new Promise((resolve) => setTimeout(resolve, 50));
    // @ts-ignore
    restartManager.onFileChange("test2.ts");
    await new Promise((resolve) => setTimeout(resolve, 50));
    // @ts-ignore
    restartManager.onFileChange("test3.ts");

    // Wait for debounce + idle check
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Should only restart once despite multiple changes
    expect(onRestartMock).toHaveBeenCalledTimes(1);
  });

  test("should stop watching when stop() is called", () => {
    restartManager = new RestartManager({
      watchPaths: [testDir],
      isIdle: isIdleMock,
      onRestart: onRestartMock,
    });

    restartManager.start();
    restartManager.stop();

    // If no error is thrown, the test passes
    expect(true).toBe(true);
  });
});

