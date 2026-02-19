#!/usr/bin/env bun
import isCI from "is-ci";

// Task definitions with lazy dynamic imports to avoid top-level DB calls at import time.
// Modules are only loaded when DRY_RUN=false (real execution).
const TASK_DEFS = [
  {
    name: "GitHub Bounty Task",
    load: () => import("./gh-bounty/gh-bounty").then((m) => m.default),
  },
  {
    name: "GitHub Design Task",
    load: () => import("./gh-design/gh-design").then((m) => m.runGithubDesignTask),
  },
  {
    name: "GitHub Desktop Release Notification Task",
    load: () => import("./gh-desktop-release-notification/index").then((m) => m.default),
  },
  {
    name: "GitHub Frontend Release Notification Task",
    load: () => import("./gh-frontend-release-notification/index").then((m) => m.default),
  },
  {
    name: "GitHub Frontend Backport Checker Task",
    load: () => import("./gh-frontend-backport-checker/index").then((m) => m.default),
  },
  {
    name: "GitHub Core Tag Notification Task",
    load: () => import("./gh-core-tag-notification/index").then((m) => m.default),
  },
  // issue transfer between repos: ComfyUI, Frontend, Desktop
  {
    name: "GitHub Frontend Issue Transfer Task",
    load: () => import("./gh-issue-transfer-comfyui-to-frontend/index").then((m) => m.default),
  },
  {
    name: "GitHub Desktop Issue Transfer Task",
    load: () => import("./gh-issue-transfer-desktop-to-frontend/index").then((m) => m.default),
  },
  {
    name: "GitHub ComfyUI to Desktop Issue Transfer Task",
    load: () => import("./gh-issue-transfer-comfyui-to-desktop/index").then((m) => m.default),
  },
  {
    name: "GitHub Frontend to Desktop Issue Transfer Task",
    load: () => import("./gh-issue-transfer-frontend-to-desktop/index").then((m) => m.default),
  },
  {
    name: "GitHub Frontend to ComfyUI Issue Transfer Task",
    load: () => import("./gh-issue-transfer-frontend-to-comfyui/index").then((m) => m.default),
  },
  {
    name: "GitHub Workflow Templates Issue Transfer Task",
    load: () =>
      import("./gh-issue-transfer-comfyui-to-workflow_templates/index").then((m) => m.default),
  },
  // priorities labeler
  {
    name: "GitHub Issue Priorities Labeler Task",
    load: () => import("./gh-priority-sync/index").then((m) => m.default),
  },
  // bugcop
  {
    name: "GitHub Bugcop Task",
    load: () => import("../../run/gh-bugcop/gh-bugcop").then((m) => m.default),
  },
  {
    name: "GitHub PR Release Tagger Task",
    load: () => import("./gh-pr-release-tagger/index").then((m) => m.default),
  },
];

const DRY_RUN = process.env.DRY_RUN !== "false";

async function runAllTasks() {
  if (DRY_RUN) {
    console.log("DRY RUN: Skipping all GitHub tasks (set DRY_RUN=false to run for real)");
    TASK_DEFS.forEach((task) => console.log(`  - ${task.name}`));
    console.log("\nDry run complete - no changes made.");
    return;
  }

  // Load task modules only when actually running (avoids top-level DB calls during dry run)
  const { db } = await import("@/src/db");

  const tasks = await Promise.all(
    TASK_DEFS.map(async (def) => ({ name: def.name, run: await def.load() })),
  );

  console.log("Starting all GitHub tasks...");

  // Run all tasks concurrently using Promise.allSettled
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      console.log(`Starting: ${task.name}`);
      const startTime = Date.now();

      const id = setInterval(() => {
        // ping per 10s
        console.log(`[debug] ping: ${task.name} still running`);
      }, 10e3);
      try {
        await task.run();

        const duration = Date.now() - startTime;
        console.log(`Completed: ${task.name} (${duration}ms)`);
        return { name: task.name, status: "success", duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`Failed: ${task.name} (${duration}ms)`, error);
        throw { name: task.name, status: "error", duration, error };
      } finally {
        clearInterval(id);
      }
    }),
  );

  // Process results
  const successful = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");

  console.log(`\nSummary:`);
  console.log(`  Successful: ${successful.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(`  Total: ${results.length}`);

  // Log details for successful tasks
  successful.forEach((result) => {
    if (result.status === "fulfilled") {
      console.log(`  ${result.value.name}: ${result.value.duration}ms`);
    }
  });

  // Log details for failed tasks
  failed.forEach((result) => {
    if (result.status === "rejected") {
      const error = result.reason;
      console.error(
        `  ${error.name}: ${error.duration}ms - ${error.error?.message || error.error}`,
      );
    }
  });

  // If any task failed, exit with error code
  if (failed.length > 0) {
    console.error(`\n${failed.length} task(s) failed. Exiting with error code 1.`);
    if (isCI) {
      await db.close();
      process.exit(1);
    }
  }

  console.log("\nAll tasks completed successfully!");

  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

if (import.meta.main) {
  await runAllTasks();
}

export default runAllTasks;
