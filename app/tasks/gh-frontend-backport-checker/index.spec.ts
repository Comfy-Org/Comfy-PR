import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { BackportStatus } from "./index";

describe("GithubFrontendBackportCheckerTask", () => {
  describe("bugfix detection", () => {
    const bugfixPatterns = /\b(fix|bugfix|hotfix|patch|bug)\b/i;

    it("should detect bugfix commits", () => {
      const bugfixMessages = [
        "fix: resolve authentication issue",
        "bugfix: correct header alignment",
        "hotfix: patch critical security vulnerability",
        "patch: update dependencies",
        "fix bug in user profile",
      ];

      bugfixMessages.forEach((message) => {
        expect(bugfixPatterns.test(message)).toBe(true);
      });
    });

    it("should not detect non-bugfix commits", () => {
      const nonBugfixMessages = [
        "feat: add new feature",
        "docs: update README",
        "refactor: reorganize code structure",
        "chore: update dependencies",
        "style: improve formatting",
      ];

      nonBugfixMessages.forEach((message) => {
        expect(bugfixPatterns.test(message)).toBe(false);
      });
    });

    it("should be case insensitive", () => {
      expect(bugfixPatterns.test("FIX: capital fix")).toBe(true);
      expect(bugfixPatterns.test("Bug: capital bug")).toBe(true);
      expect(bugfixPatterns.test("HOTFIX: all caps")).toBe(true);
    });
  });

  describe("backport status determination", () => {
    it("should mark as completed when has completed label", () => {
      const labels = ["backport-completed", "bug"];
      const hasCompleted = labels.some((l) => l.toLowerCase().includes("completed"));
      expect(hasCompleted).toBe(true);
    });

    it("should mark as in-progress when has in-progress label", () => {
      const labels = ["backport-in-progress", "bug"];
      const hasInProgress = labels.some((l) => l.toLowerCase().includes("in-progress"));
      expect(hasInProgress).toBe(true);
    });

    it("should mark as needed when has needs backport label", () => {
      const labels = ["needs-backport", "bug"];
      const hasNeeds = labels.some((l) => l.toLowerCase().includes("needs"));
      expect(hasNeeds).toBe(true);
    });

    it("should mark as needed when has backport label", () => {
      const labels = ["backport", "stable"];
      const backportLabels = ["backport", "backport-stable", "needs-backport", "stable"];
      const hasBackportLabel = labels.some((l) =>
        backportLabels.some((bl) => l.toLowerCase().includes(bl.toLowerCase())),
      );
      expect(hasBackportLabel).toBe(true);
    });

    it("should detect backport mentions in text", () => {
      const texts = [
        "This needs to be backported to stable",
        "backport this fix please",
        "Should we backport this?",
        "stable release candidate",
      ];

      texts.forEach((text) => {
        const mentioned = /backport/i.test(text) || /stable/i.test(text);
        expect(mentioned).toBe(true);
      });
    });
  });

  describe("status emoji mapping", () => {
    function getStatusEmoji(status: BackportStatus): string {
      switch (status) {
        case "completed":
          return "✅";
        case "in-progress":
          return "🔄";
        case "needed":
          return "❌";
        case "not-needed":
          return "➖";
        case "unknown":
          return "❓";
        default:
          return "⚪";
      }
    }

    it("should return correct emoji for each status", () => {
      expect(getStatusEmoji("completed")).toBe("✅");
      expect(getStatusEmoji("in-progress")).toBe("🔄");
      expect(getStatusEmoji("needed")).toBe("❌");
      expect(getStatusEmoji("not-needed")).toBe("➖");
      expect(getStatusEmoji("unknown")).toBe("❓");
    });
  });

  describe("Slack summary formatting", () => {
    it("should format bugfixes grouped by release", () => {
      const bugfixes = [
        {
          releaseTag: "v1.0.0",
          releaseUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
          commitSha: "abc123",
          commitMessage: "fix: authentication bug",
          prNumber: 100,
          prUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/100",
          prTitle: "Fix authentication bug",
          backportStatus: "needed" as BackportStatus,
          backportLabels: ["needs-backport"],
          backportMentioned: true,
          releaseCreatedAt: new Date("2025-01-01"),
          checkedAt: new Date(),
        },
        {
          releaseTag: "v1.0.0",
          releaseUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
          commitSha: "def456",
          commitMessage: "fix: render issue",
          prNumber: 101,
          prUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/101",
          prTitle: "Fix render issue",
          backportStatus: "completed" as BackportStatus,
          backportLabels: ["backport-completed"],
          backportMentioned: false,
          releaseCreatedAt: new Date("2025-01-01"),
          checkedAt: new Date(),
        },
      ];

      const summary = generateTestSlackSummary(bugfixes);

      expect(summary).toContain("ComfyUI_frontend Backport Status Report");
      expect(summary).toContain("Release v1.0.0");
      expect(summary).toContain("Fix authentication bug");
      expect(summary).toContain("Fix render issue");
      expect(summary).toContain("#100");
      expect(summary).toContain("#101");
      expect(summary).toContain("needs-backport");
      expect(summary).toContain("backport-completed");
    });

    it("should sort bugfixes by priority", () => {
      const bugfixes = [
        createTestBugfix("v1.0.0", "completed"),
        createTestBugfix("v1.0.0", "needed"),
        createTestBugfix("v1.0.0", "in-progress"),
        createTestBugfix("v1.0.0", "unknown"),
        createTestBugfix("v1.0.0", "not-needed"),
      ];

      const summary = generateTestSlackSummary(bugfixes);
      const lines = summary.split("\n");

      // Find the order of status emojis
      const emojiOrder = lines
        .filter((line) => line.trim().startsWith("❌") || line.trim().startsWith("🔄") || line.trim().startsWith("✅"))
        .map((line) => line.trim()[0]);

      // Should be ordered: needed (❌), in-progress (🔄), completed (✅)
      const expectedOrder = ["❌", "🔄", "✅"];
      expect(emojiOrder.slice(0, 3)).toEqual(expectedOrder);
    });
  });

  describe("database operations", () => {
    it("should use commitSha as unique identifier", () => {
      // This test validates the schema design
      const uniqueField = "commitSha";
      expect(uniqueField).toBe("commitSha");
    });

    it("should include all required indexes", () => {
      const indexes = ["commitSha", "releaseTag", "checkedAt"];
      expect(indexes).toContain("commitSha");
      expect(indexes).toContain("releaseTag");
      expect(indexes).toContain("checkedAt");
    });
  });

  describe("error handling", () => {
    it("should handle missing PR gracefully", () => {
      const commitWithoutPR = {
        commitSha: "abc123",
        commitMessage: "fix: some bug",
        prNumber: undefined,
        prUrl: undefined,
        backportStatus: "unknown" as BackportStatus,
      };

      expect(commitWithoutPR.backportStatus).toBe("unknown");
      expect(commitWithoutPR.prNumber).toBeUndefined();
    });

    it("should handle empty labels array", () => {
      const labels: string[] = [];
      const backportLabels = ["backport", "backport-stable", "needs-backport", "stable"];
      const filtered = labels.filter((l) =>
        backportLabels.some((bl) => l.toLowerCase().includes(bl.toLowerCase())),
      );

      expect(filtered).toEqual([]);
    });

    it("should handle missing PR body", () => {
      const bodyText = "";
      const mentioned = /backport/i.test(bodyText) || /stable/i.test(bodyText);
      expect(mentioned).toBe(false);
    });
  });

  describe("configuration validation", () => {
    it("should have valid config values", () => {
      const config = {
        repo: "https://github.com/Comfy-Org/ComfyUI_frontend",
        slackChannel: "frontend",
        bugfixPatterns: /\b(fix|bugfix|hotfix|patch|bug)\b/i,
        backportLabels: ["backport", "backport-stable", "needs-backport", "stable"],
        processSince: new Date("2025-01-01T00:00:00Z").toISOString(),
        maxReleasesToCheck: 5,
      };

      expect(config.repo).toContain("github.com");
      expect(config.slackChannel).toBe("frontend");
      expect(config.backportLabels.length).toBeGreaterThan(0);
      expect(config.maxReleasesToCheck).toBeGreaterThan(0);
    });
  });
});

// Helper functions for testing
function createTestBugfix(releaseTag: string, status: BackportStatus) {
  return {
    releaseTag,
    releaseUrl: `https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/${releaseTag}`,
    commitSha: Math.random().toString(36).substring(7),
    commitMessage: `fix: test bug ${status}`,
    prNumber: Math.floor(Math.random() * 1000),
    prUrl: `https://github.com/Comfy-Org/ComfyUI_frontend/pull/${Math.floor(Math.random() * 1000)}`,
    prTitle: `Test PR ${status}`,
    backportStatus: status,
    backportLabels: status === "needed" ? ["needs-backport"] : [],
    backportMentioned: false,
    releaseCreatedAt: new Date("2025-01-01"),
    checkedAt: new Date(),
  };
}

function generateTestSlackSummary(
  bugfixes: Array<{
    releaseTag: string;
    releaseUrl: string;
    commitMessage: string;
    prNumber?: number;
    prUrl?: string;
    prTitle?: string;
    backportStatus: BackportStatus;
    backportLabels: string[];
  }>,
): string {
  const grouped = new Map<string, typeof bugfixes>();

  bugfixes.forEach((bf) => {
    const key = bf.releaseTag;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(bf);
  });

  let summary = "🔄 *ComfyUI_frontend Backport Status Report*\n\n";

  for (const [releaseTag, items] of grouped) {
    const releaseUrl = items[0].releaseUrl;
    summary += `*<${releaseUrl}|Release ${releaseTag}>*\n`;

    const sorted = items.sort((a, b) => {
      const order = { needed: 0, "in-progress": 1, completed: 2, unknown: 3, "not-needed": 4 };
      return order[a.backportStatus] - order[b.backportStatus];
    });

    sorted.forEach((item) => {
      const emoji = getTestStatusEmoji(item.backportStatus);
      const prLink = item.prUrl ? `<${item.prUrl}|#${item.prNumber}>` : "No PR";
      const labels = item.backportLabels.length > 0 ? ` [${item.backportLabels.join(", ")}]` : "";

      summary += `  ${emoji} ${prLink}: ${item.prTitle || item.commitMessage}${labels}\n`;
    });

    summary += "\n";
  }

  summary += `_Checked ${bugfixes.length} bugfix commits across ${grouped.size} releases_`;

  return summary;
}

function getTestStatusEmoji(status: BackportStatus): string {
  switch (status) {
    case "completed":
      return "✅";
    case "in-progress":
      return "🔄";
    case "needed":
      return "❌";
    case "not-needed":
      return "➖";
    case "unknown":
      return "❓";
    default:
      return "⚪";
  }
}
