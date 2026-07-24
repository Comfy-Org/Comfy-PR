const PAUSED_COMBINED_GITHUB_TASK_NAMES = new Set([
  // Paused because task tracking migrated from Notion to Linear.
  "GitHub Issue Priorities Labeler Task",
]);

export function getScheduledCombinedGithubTasks<T extends { name: string }>(
  tasks: readonly T[],
): T[] {
  return tasks.filter((task) => !PAUSED_COMBINED_GITHUB_TASK_NAMES.has(task.name));
}
