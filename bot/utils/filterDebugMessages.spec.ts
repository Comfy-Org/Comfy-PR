import { describe, expect, test } from "bun:test";
import { filterInternalThoughts, getFilteredContent } from "./filterDebugMessages";

describe("filterInternalThoughts", () => {
  test("filters retry/upload debugging messages", () => {
    const input = `
retrying the slack upload...
Task is running
Retrying slack message send
Work completed successfully
uploading file, retry attempt 3
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toContain("retrying");
    expect(result).not.toContain("upload");
    expect(result).toContain("Task is running");
    expect(result).toContain("Work completed successfully");
  });

  test("filters absolute file paths", () => {
    const input = `
Processing /repos/Comfy-Org/project/src/file.ts
Task completed
Reading from /home/user/.cache/data.json
Working on /tmp/temp-file.txt
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toContain("/repos/");
    expect(result).not.toContain("/home/");
    expect(result).not.toContain("/tmp/");
    expect(result).toContain("Task completed");
  });

  test("filters process and PID information", () => {
    const input = `
Starting process
PID: 12345
Process ID: 67890
Task running with process.env
exit code: 0
Finished successfully
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toContain("PID");
    expect(result).not.toContain("Process ID");
    expect(result).not.toContain("process.env");
    expect(result).not.toContain("exit code");
    expect(result).toContain("Starting process");
    expect(result).toContain("Finished successfully");
  });

  test("filters timestamp patterns", () => {
    const input = `
[2024-01-09T10:30:45] Starting task
Task in progress
10:30:45.123 Processing item
timestamp: 1704793845
Completed
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toContain("[2024-01-09");
    expect(result).not.toContain("10:30:45.123");
    expect(result).not.toContain("timestamp:");
    expect(result).toContain("Starting task");
    expect(result).toContain("Task in progress");
    expect(result).toContain("Completed");
  });

  test("filters ANSI escape codes", () => {
    const input = `
\x1b[32mGreen text\x1b[0m
Normal text
\x1b[1;31mRed bold text\x1b[0m
More content
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toMatch(/\x1b\[/);
    expect(result).toContain("Green text");
    expect(result).toContain("Normal text");
    expect(result).toContain("Red bold text");
  });

  test("filters terminal control characters", () => {
    const input = "Task\x00running\x01with\x02control\x03chars\x04here\x05";

    const result = filterInternalThoughts(input);

    expect(result).not.toMatch(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/);
    expect(result).toContain("Task");
    expect(result).toContain("running");
  });

  test("filters system and environment info", () => {
    const input = `
Installing node_modules
Task processing
Running bun run dev
Using npm run build
Executing yarn run test
Work done
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toContain("node_modules");
    expect(result).not.toContain("bun run");
    expect(result).not.toContain("npm run");
    expect(result).not.toContain("yarn run");
    expect(result).toContain("Task processing");
    expect(result).toContain("Work done");
  });

  test("filters git internal messages", () => {
    const input = `
git fetch origin
HEAD is now at abc1234
From https://github.com/user/repo
Task completed
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toContain("git fetch");
    expect(result).not.toContain("HEAD is now");
    expect(result).not.toContain("From https://");
    expect(result).toContain("Task completed");
  });

  test("filters debug/trace logging prefixes", () => {
    const input = `
[DEBUG] Entering function
Processing data
[TRACE] Variable value: 123
[VERBOSE] Detailed information
Task finished
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toContain("[DEBUG]");
    expect(result).not.toContain("[TRACE]");
    expect(result).not.toContain("[VERBOSE]");
    expect(result).toContain("Processing data");
    expect(result).toContain("Task finished");
  });

  test("filters stack trace elements", () => {
    const input = `
Running task
Error: Something went wrong
    at processTask (/app/src/task.ts:42:15)
    at runTask (/app/src/runner.ts:100:20)
Recovering from error
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).not.toContain("at processTask");
    expect(result).not.toContain("at runTask");
    expect(result).not.toContain("Error:");
    expect(result).toContain("Running task");
    expect(result).toContain("Recovering from error");
  });

  test("removes empty lines after filtering", () => {
    const input = `
Task started

[DEBUG] Debug message


Processing item


Task completed

    `.trim();

    const result = filterInternalThoughts(input);
    const lines = result.split('\n');

    // Should not have consecutive empty lines
    expect(result).toContain("Task started");
    expect(result).toContain("Processing item");
    expect(result).toContain("Task completed");
    expect(lines.every(line => line.trim() !== '')).toBe(true);
  });

  test("handles mixed content with multiple patterns", () => {
    const input = `
[2024-01-09T10:30:45] Starting task in /repos/project/src
retrying the slack upload...
PID: 12345
\x1b[32mTask is running\x1b[0m
Processing item 1
bun run dev started
Processing item 2
git fetch origin
Processing item 3
[DEBUG] Debug info
Task completed successfully
exit code: 0
    `.trim();

    const result = filterInternalThoughts(input);

    // Should keep user-relevant content
    expect(result).toContain("Task is running");
    expect(result).toContain("Processing item 1");
    expect(result).toContain("Processing item 2");
    expect(result).toContain("Processing item 3");
    expect(result).toContain("Task completed successfully");

    // Should remove debug content
    expect(result).not.toContain("2024-01-09");
    expect(result).not.toContain("/repos/");
    expect(result).not.toContain("retrying");
    expect(result).not.toContain("PID");
    expect(result).not.toContain("\x1b[");
    expect(result).not.toContain("bun run");
    expect(result).not.toContain("git fetch");
    expect(result).not.toContain("[DEBUG]");
    expect(result).not.toContain("exit code");
  });

  test("handles empty input", () => {
    const result = filterInternalThoughts("");
    expect(result).toBe("");
  });

  test("handles input with only debug messages", () => {
    const input = `
retrying the slack upload...
[DEBUG] Debug message
PID: 12345
    `.trim();

    const result = filterInternalThoughts(input);
    expect(result).toBe("");
  });

  test("preserves user-relevant content intact", () => {
    const input = `
Analyzing repository structure
Found 42 TypeScript files
Identified 3 potential issues:
1. Missing type annotations in auth module
2. Unused imports in utils
3. Potential memory leak in cache
Recommendation: Add strict type checking
    `.trim();

    const result = filterInternalThoughts(input);

    expect(result).toBe(input);
  });
});

describe("getFilteredContent", () => {
  test("extracts filtered-out lines", () => {
    const rawOutput = `
Task started
retrying the slack upload...
Processing item
PID: 12345
Task completed
    `.trim();

    const filtered = filterInternalThoughts(rawOutput);
    const filteredOut = getFilteredContent(rawOutput, filtered);

    expect(filteredOut).toContain("retrying the slack upload...");
    expect(filteredOut).toContain("PID: 12345");
    expect(filteredOut.length).toBe(2);
  });

  test("returns empty array when nothing filtered", () => {
    const rawOutput = `
Task started
Processing item
Task completed
    `.trim();

    const filtered = filterInternalThoughts(rawOutput);
    const filteredOut = getFilteredContent(rawOutput, filtered);

    expect(filteredOut.length).toBe(0);
  });

  test("handles empty input", () => {
    const filteredOut = getFilteredContent("", "");
    expect(filteredOut.length).toBe(0);
  });
});
