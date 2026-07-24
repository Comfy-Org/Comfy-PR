import { describe, expect, it } from "bun:test";
import { getScheduledCombinedGithubTasks } from "./combinedTaskSchedule";

describe("combined GitHub task schedule", () => {
  it("pauses only the retired Notion priority sync task", () => {
    const scheduledTasks = getScheduledCombinedGithubTasks([
      { name: "GitHub Frontend Release Notification Task" },
      { name: "GitHub Frontend Backport Checker Task" },
      { name: "GitHub Issue Priorities Labeler Task" },
    ]);

    expect(scheduledTasks.map((task) => task.name)).toEqual([
      "GitHub Frontend Release Notification Task",
      "GitHub Frontend Backport Checker Task",
    ]);
  });
});
