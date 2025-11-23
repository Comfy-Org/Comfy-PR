#!/usr/bin/env bun
import { db } from "@/src/db";
import isCI from "is-ci";

// Import all the 5-minute tasks
import runGithubBugcopTask from "../../run/gh-bugcop/gh-bugcop";
import runGithubBountyTask from "./gh-bounty/gh-bounty";
import runGithubCoreTagNotificationTask from "./gh-core-tag-notification/index";
import { runGithubDesignTask } from "./gh-design/gh-design";
import runGithubDesktopReleaseNotificationTask from "./gh-desktop-release-notification/index";
import runGithubFrontendReleaseNotificationTask from "./gh-frontend-release-notification/index";
import runGithubComfyUIToDesktopIssueTransferTask from "./gh-issue-transfer-comfyui-to-desktop/index";
import runGithubFrontendIssueTransferTask from "./gh-issue-transfer-comfyui-to-frontend/index";
import runGithubDesktopIssueTransferTask from "./gh-issue-transfer-desktop-to-frontend/index";
import runGithubFrontendToComfyuiIssueTransferTask from "./gh-issue-transfer-frontend-to-comfyui/index";
import runGithubFrontendToDesktopIssueTransferTask from "./gh-issue-transfer-frontend-to-desktop/index";

const TASKS = [
  {
    name: "GitHub Bounty Task",
    run: runGithubBountyTask,
  },
  {
    name: "GitHub Design Task",
    run: runGithubDesignTask,
  },
  {
    name: "GitHub Desktop Release Notification Task",
    run: runGithubDesktopReleaseNotificationTask,
  },
  {
    name: "GitHub Frontend Release Notification Task",
    run: runGithubFrontendReleaseNotificationTask,
  },
  {
    name: "GitHub Core Tag Notification Task",
    run: runGithubCoreTagNotificationTask,
  },
  // issue transfer between repos: ComfyUI, Frontend, Desktop
  {
    name: "GitHub Frontend Issue Transfer Task",
    run: runGithubFrontendIssueTransferTask,
  },
  {
    name: "GitHub Desktop Issue Transfer Task",
    run: runGithubDesktopIssueTransferTask,
  },
  {
    name: "GitHub ComfyUI to Desktop Issue Transfer Task",
    run: runGithubComfyUIToDesktopIssueTransferTask,
  },
  {
    name: "GitHub Frontend to Desktop Issue Transfer Task",
    run: runGithubFrontendToDesktopIssueTransferTask,
  },
  {
    name: "GitHub Frontend to ComfyUI Issue Transfer Task",
    run: runGithubFrontendToComfyuiIssueTransferTask,
  },
  // bugcop
  {
    name: "GitHub Bugcop Task",
    run: runGithubBugcopTask,
  },
];

async function runAllTasks() {
  console.log("=� Starting all GitHub tasks...");

  // Run all tasks concurrently using Promise.allSettled
  const results = await Promise.allSettled(
    TASKS.map(async (task) => {
      console.log(`� Starting: ${task.name}`);
      const startTime = Date.now();

      try {
        await task.run();
        const duration = Date.now() - startTime;
        console.log(` Completed: ${task.name} (${duration}ms)`);
        return { name: task.name, status: "success", duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`L Failed: ${task.name} (${duration}ms)`, error);
        throw { name: task.name, status: "error", duration, error };
      }
    }),
  );

  // Process results
  const successful = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");

  console.log(`\n=� Summary:`);
  console.log(`   Successful: ${successful.length}`);
  console.log(`  L Failed: ${failed.length}`);
  console.log(`  =� Total: ${results.length}`);

  // Log details for successful tasks
  successful.forEach((result) => {
    if (result.status === "fulfilled") {
      console.log(`   ${result.value.name}: ${result.value.duration}ms`);
    }
  });

  // Log details for failed tasks
  failed.forEach((result) => {
    if (result.status === "rejected") {
      const error = result.reason;
      console.error(`  L ${error.name}: ${error.duration}ms - ${error.error?.message || error.error}`);
    }
  });

  // If any task failed, exit with error code
  if (failed.length > 0) {
    console.error(`\n=� ${failed.length} task(s) failed. Exiting with error code 1.`);
    if (isCI) {
      await db.close();
    }
    process.exit(1);
  }

  console.log("\n<� All tasks completed successfully!");

  if (isCI) {
    await db.close();
    process.exit(0);
  }
}

if (import.meta.main) {
  await runAllTasks();
}

export default runAllTasks;
