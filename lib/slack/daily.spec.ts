import { describe, expect, test } from "bun:test";
import isCI from "is-ci";

// Check if we have a valid Slack token (not a placeholder) and not in CI
const hasValidSlackToken =
  !isCI &&
  process.env.SLACK_BOT_TOKEN &&
  !process.env.SLACK_BOT_TOKEN.includes("FILL_THIS") &&
  !process.env.SLACK_BOT_TOKEN.includes("FAKE");

describe("daily.ts", () => {
  test("should be importable", async () => {
    const { default: dailyUpdate } = await import("./daily");
    expect(dailyUpdate).toBeDefined();
    expect(typeof dailyUpdate).toBe("function");
  });

  // Integration tests - only run when valid SLACK_BOT_TOKEN is available
  // These tests are skipped in CI/test environments with fake tokens
  if (hasValidSlackToken) {
    describe("with valid Slack token", () => {
      test("should generate a daily report", async () => {
        const { default: dailyUpdate } = await import("./daily");
        const report = await dailyUpdate({ verbose: false });

        // Check report structure
        expect(report).toContain("# ComfyPR-Bot Daily Report");
        expect(report).toContain("## Summary");
        expect(report).toContain("## Team Daily Update Format");
        expect(report).toContain("## Bot Activity by Channel");
        expect(report).toContain("## Short Summary");
      }, 30000);

      test("should include summary statistics", async () => {
        const { default: dailyUpdate } = await import("./daily");
        const report = await dailyUpdate({ verbose: false });

        expect(report).toMatch(/Total messages sent: \d+/);
        expect(report).toMatch(/Channels active: \d+/);
      }, 30000);

      test("should include date in report", async () => {
        const { default: dailyUpdate } = await import("./daily");
        const report = await dailyUpdate({ verbose: false });
        const today = new Date().toISOString().split("T")[0];

        expect(report).toContain(today);
      }, 30000);

      test("should handle no messages gracefully", async () => {
        const { default: dailyUpdate } = await import("./daily");
        const report = await dailyUpdate({ verbose: false });
        expect(report).toBeTruthy();
        expect(typeof report).toBe("string");
      }, 30000);
    });
  } else {
    test.skip("Integration tests skipped - no valid Slack token", () => {
      // This test is just a placeholder to show why integration tests are skipped
    });
  }
});
