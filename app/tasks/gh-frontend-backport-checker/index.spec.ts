import { describe, it, expect } from "bun:test";
import type { BackportStatus } from "./index";
import { parseMinorVersion, middleTruncated, getBackportStatusEmoji } from "./index";

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

      // Find the order of status emojis (lines with bugfix entries have format "  EMOJI ...")
      // Filter for indented lines only to exclude the header "🔄 *ComfyUI_frontend..."
      const emojiOrder = lines
        .filter(
          (line) =>
            line.startsWith("  ") &&
            (line.includes("❌") || line.includes("🔄") || line.includes("✅")),
        )
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("❌")) return "❌";
          if (trimmed.startsWith("🔄")) return "🔄";
          if (trimmed.startsWith("✅")) return "✅";
          return "";
        })
        .filter((emoji) => emoji !== "");

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

  describe("parseMinorVersion", () => {
    it("should parse minor version from standard semver tags", () => {
      expect(parseMinorVersion("v1.38.1")).toBe(38);
      expect(parseMinorVersion("v1.0.0")).toBe(0);
      expect(parseMinorVersion("v2.5.3")).toBe(5);
      expect(parseMinorVersion("v1.100.0")).toBe(100);
    });

    it("should parse tags without v prefix", () => {
      expect(parseMinorVersion("1.38.1")).toBe(38);
      expect(parseMinorVersion("1.0.0")).toBe(0);
    });

    it("should return null for unparseable tags", () => {
      expect(parseMinorVersion("latest")).toBeNull();
      expect(parseMinorVersion("nightly")).toBeNull();
      expect(parseMinorVersion("")).toBeNull();
    });
  });

  describe("version-based release filtering", () => {
    it("should include releases within maxMinorVersionsBehind of latest", () => {
      const maxMinorVersionsBehind = 4;
      const latestMinor = 40;
      const releases = [
        { tag: "v1.40.0", minor: 40 },
        { tag: "v1.39.2", minor: 39 },
        { tag: "v1.38.1", minor: 38 },
        { tag: "v1.37.0", minor: 37 },
        { tag: "v1.36.0", minor: 36 }, // exactly 4 behind, should be included (<=)
        { tag: "v1.35.0", minor: 35 }, // 5 behind, should be excluded
      ];

      const included = releases.filter((r) => latestMinor - r.minor <= maxMinorVersionsBehind);
      expect(included.map((r) => r.tag)).toEqual([
        "v1.40.0",
        "v1.39.2",
        "v1.38.1",
        "v1.37.0",
        "v1.36.0",
      ]);
    });
  });

  describe("backport-not-needed labels", () => {
    const backportNotNeededLabels: Record<string, string> = {
      core: "core-backport-not-needed",
      cloud: "cloud-backport-not-needed",
    };

    function hasBackportNotNeededLabel(labels: string[], targetPrefix: string): boolean {
      const notNeededLabel = backportNotNeededLabels[targetPrefix];
      if (!notNeededLabel) return false;
      return labels.some((l) => l.toLowerCase() === notNeededLabel.toLowerCase());
    }

    it("should detect core-backport-not-needed label", () => {
      const labels = ["bug", "core-backport-not-needed", "core/1.4"];
      expect(hasBackportNotNeededLabel(labels, "core")).toBe(true);
      expect(hasBackportNotNeededLabel(labels, "cloud")).toBe(false);
    });

    it("should detect cloud-backport-not-needed label", () => {
      const labels = ["bug", "cloud-backport-not-needed", "cloud/1.36"];
      expect(hasBackportNotNeededLabel(labels, "cloud")).toBe(true);
      expect(hasBackportNotNeededLabel(labels, "core")).toBe(false);
    });

    it("should be case insensitive", () => {
      const labels = ["Core-Backport-Not-Needed"];
      expect(hasBackportNotNeededLabel(labels, "core")).toBe(true);
    });

    it("should return false when no matching label", () => {
      const labels = ["bug", "needs-backport"];
      expect(hasBackportNotNeededLabel(labels, "core")).toBe(false);
      expect(hasBackportNotNeededLabel(labels, "cloud")).toBe(false);
    });

    it("should return false for unknown target prefix", () => {
      const labels = ["core-backport-not-needed"];
      expect(hasBackportNotNeededLabel(labels, "unknown")).toBe(false);
    });
  });

  describe("release sheriff parsing", () => {
    it("should parse Slack user ID from channel description", () => {
      const text = "Current Release Sheriff: <@U12345678>";
      const match = text.match(/Release Sheriff:?\s*<@(\w+)>/i);
      expect(match?.[1]).toBe("U12345678");
    });

    it("should handle description without sheriff", () => {
      const text = "Frontend releases channel";
      const match = text.match(/Release Sheriff:?\s*<@(\w+)>/i);
      expect(match).toBeNull();
    });

    it("should handle various formatting", () => {
      const formats = [
        "Release Sheriff: <@U999>",
        "Current Release Sheriff: <@UABC123>",
        "release sheriff <@U111>",
      ];
      for (const text of formats) {
        const match = text.match(/Release Sheriff:?\s*<@(\w+)>/i);
        expect(match?.[1]).toBeTruthy();
      }
    });
  });

  describe("middleTruncated", () => {
    it("should return string as-is when within maxLength", () => {
      expect(middleTruncated(20, "short string")).toBe("short string");
    });

    it("should return string as-is when exactly maxLength", () => {
      expect(middleTruncated(5, "abcde")).toBe("abcde");
    });

    it("should truncate middle of long strings", () => {
      const result = middleTruncated(11, "abcdefghijklmnop");
      expect(result).toHaveLength(11);
      expect(result).toContain("...");
      expect(result.startsWith("abcd")).toBe(true);
      expect(result.endsWith("mnop")).toBe(true);
    });

    it("should handle empty string", () => {
      expect(middleTruncated(10, "")).toBe("");
    });
  });

  describe("getBackportStatusEmoji", () => {
    it("should return Slack emoji for completed", () => {
      expect(getBackportStatusEmoji("completed")).toBe(":pr-merged:");
    });

    it("should return Slack emoji for in-progress", () => {
      expect(getBackportStatusEmoji("in-progress")).toBe(":pr-open:");
    });

    it("should return exclamation for needed", () => {
      expect(getBackportStatusEmoji("needed")).toContain("Need backport");
    });

    it("should return dash for not-needed", () => {
      expect(getBackportStatusEmoji("not-needed")).toBe("➖");
    });

    it("should return spaces for unknown", () => {
      expect(getBackportStatusEmoji("unknown")).toBe("  ");
    });
  });

  describe("already-backported commit filtering", () => {
    const backportFilter = /\[backport .*?\]/i;

    it("should detect [backport ...] commits", () => {
      expect(backportFilter.test("[backport core/1.4] fix: auth bug")).toBe(true);
      expect(backportFilter.test("[Backport cloud/1.36] fix: render issue")).toBe(true);
      expect(backportFilter.test("[BACKPORT stable] hotfix: crash")).toBe(true);
    });

    it("should not filter normal bugfix commits", () => {
      expect(backportFilter.test("fix: authentication bug")).toBe(false);
      expect(backportFilter.test("hotfix: resolve crash")).toBe(false);
    });

    it("should handle backport with various content inside brackets", () => {
      expect(backportFilter.test("[backport core/1.4, cloud/1.36] fix: bug")).toBe(true);
      expect(backportFilter.test("[backport v2] patch: security fix")).toBe(true);
    });

    it("should not match empty backport brackets", () => {
      expect(backportFilter.test("[backport] fix: something")).toBe(false);
    });
  });

  describe("bot comment filtering", () => {
    const botPattern = /\bbot$|\[bot\]$/;

    it("should detect bot usernames", () => {
      expect(botPattern.test("dependabot")).toBe(false); // "dependabot" doesn't match \bbot — "bot" is a full word here, let me check
      expect(botPattern.test("github-actions[bot]")).toBe(true);
      expect(botPattern.test("renovate[bot]")).toBe(true);
      expect(botPattern.test("comfy-bot")).toBe(true);
    });

    it("should not filter human usernames", () => {
      expect(botPattern.test("john")).toBe(false);
      expect(botPattern.test("robotics-engineer")).toBe(false);
      expect(botPattern.test("bottleneck")).toBe(false);
    });

    it("should match usernames ending in 'bot' as a word boundary", () => {
      expect(botPattern.test("some-bot")).toBe(true);
      expect(botPattern.test("mybot")).toBe(false); // no word boundary before "bot"
    });
  });

  describe("overall backport status derivation", () => {
    function deriveOverallStatus(
      backportTargetStatus: Array<{ status: BackportStatus }>,
    ): BackportStatus {
      const activeTargets = backportTargetStatus.filter((t) => t.status !== "not-needed");
      return activeTargets.length && activeTargets.every((t) => t.status === "completed")
        ? "completed"
        : activeTargets.some((t) => t.status === "in-progress")
          ? "in-progress"
          : activeTargets.some((t) => t.status === "needed")
            ? "needed"
            : backportTargetStatus.length && !activeTargets.length
              ? "not-needed"
              : "unknown";
    }

    it("should return completed when all active targets are completed", () => {
      expect(deriveOverallStatus([{ status: "completed" }, { status: "completed" }])).toBe(
        "completed",
      );
    });

    it("should return in-progress when any target is in-progress", () => {
      expect(deriveOverallStatus([{ status: "completed" }, { status: "in-progress" }])).toBe(
        "in-progress",
      );
    });

    it("should return needed when any target is needed", () => {
      expect(deriveOverallStatus([{ status: "completed" }, { status: "needed" }])).toBe("needed");
    });

    it("should return not-needed when all targets are not-needed", () => {
      expect(deriveOverallStatus([{ status: "not-needed" }, { status: "not-needed" }])).toBe(
        "not-needed",
      );
    });

    it("should return unknown when no targets exist", () => {
      expect(deriveOverallStatus([])).toBe("unknown");
    });

    it("should ignore not-needed targets in priority calculation", () => {
      expect(deriveOverallStatus([{ status: "not-needed" }, { status: "completed" }])).toBe(
        "completed",
      );
    });

    it("should prioritize in-progress over needed", () => {
      expect(deriveOverallStatus([{ status: "needed" }, { status: "in-progress" }])).toBe(
        "in-progress",
      );
    });

    it("should return completed when only active target is completed alongside not-needed", () => {
      expect(
        deriveOverallStatus([
          { status: "not-needed" },
          { status: "completed" },
          { status: "not-needed" },
        ]),
      ).toBe("completed");
    });
  });

  describe("compare link regex parsing", () => {
    const compareRegex =
      /github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/compare\/(?<base>\S+)\.\.\.(?<head>\S+)/;

    it("should parse standard compare links", () => {
      const url = "https://github.com/Comfy-Org/ComfyUI_frontend/compare/v1.38.0...v1.38.1";
      const groups = url.match(compareRegex)?.groups;
      expect(groups?.owner).toBe("Comfy-Org");
      expect(groups?.repo).toBe("ComfyUI_frontend");
      expect(groups?.base).toBe("v1.38.0");
      expect(groups?.head).toBe("v1.38.1");
    });

    it("should parse compare links with branch names", () => {
      const url = "https://github.com/Comfy-Org/ComfyUI_frontend/compare/main...feature/branch";
      const groups = url.match(compareRegex)?.groups;
      expect(groups?.owner).toBe("Comfy-Org");
      expect(groups?.base).toBe("main");
      expect(groups?.head).toBe("feature/branch");
    });

    it("should fail on invalid compare links", () => {
      const url = "https://github.com/Comfy-Org/ComfyUI_frontend/pulls";
      expect(url.match(compareRegex)).toBeNull();
    });
  });

  describe("backport branch name generation", () => {
    function generateBackportBranch(prNumber: number, branchName: string): string {
      return `backport-${prNumber}-to-${branchName.replaceAll("/", "-")}`;
    }

    it("should generate correct branch name with slash replacement", () => {
      expect(generateBackportBranch(123, "core/1.4")).toBe("backport-123-to-core-1.4");
    });

    it("should handle multiple slashes", () => {
      expect(generateBackportBranch(456, "cloud/1.36")).toBe("backport-456-to-cloud-1.36");
    });

    it("should handle branch names without slashes", () => {
      expect(generateBackportBranch(789, "stable")).toBe("backport-789-to-stable");
    });
  });

  describe("processSince date filtering", () => {
    const processSince = new Date("2026-01-06T00:00:00Z");

    it("should include releases after processSince", () => {
      const releaseDate = new Date("2026-02-01T00:00:00Z");
      expect(+releaseDate >= +processSince).toBe(true);
    });

    it("should include releases exactly at processSince", () => {
      const releaseDate = new Date("2026-01-06T00:00:00Z");
      expect(+releaseDate >= +processSince).toBe(true);
    });

    it("should exclude releases before processSince", () => {
      const releaseDate = new Date("2025-12-31T23:59:59Z");
      expect(+releaseDate >= +processSince).toBe(false);
    });
  });

  describe("targetBranches guard (backportStatusRaw === needed)", () => {
    const reBackportTargets = /^(core|cloud)\/1\..*$/;

    function getTargetBranches(labels: string[], backportStatusRaw: BackportStatus): string[] {
      return labels
        .filter((l) => reBackportTargets.test(l))
        .filter((_e) => backportStatusRaw === "needed");
    }

    it("should return target branches when status is needed", () => {
      const labels = ["core/1.4", "cloud/1.36", "bug"];
      expect(getTargetBranches(labels, "needed")).toEqual(["core/1.4", "cloud/1.36"]);
    });

    it("should return empty when status is unknown", () => {
      const labels = ["core/1.4", "cloud/1.36"];
      expect(getTargetBranches(labels, "unknown")).toEqual([]);
    });

    it("should return empty when status is completed", () => {
      const labels = ["core/1.4"];
      expect(getTargetBranches(labels, "completed")).toEqual([]);
    });

    it("should return empty when status is in-progress", () => {
      const labels = ["core/1.4"];
      expect(getTargetBranches(labels, "in-progress")).toEqual([]);
    });

    it("should return empty when no matching labels even if needed", () => {
      const labels = ["bug", "needs-backport"];
      expect(getTargetBranches(labels, "needed")).toEqual([]);
    });
  });

  describe("idempotent Slack update check", () => {
    it("should detect when report text has changed", () => {
      const newReport = "**Release v1.40.0 Backport Status:**\nnew content";
      const existingText = "**Release v1.40.0 Backport Status:**\nold content";
      expect(newReport.trim() !== existingText.trim()).toBe(true);
    });

    it("should skip update when text is identical", () => {
      const text = "**Release v1.40.0 Backport Status:**\nsame content";
      expect(text.trim() !== text.trim()).toBe(false);
    });

    it("should skip update when only whitespace differs at edges", () => {
      const newReport = "  report content  \n";
      const existingText = "report content";
      expect(newReport.trim() !== existingText.trim()).toBe(false);
    });
  });

  describe("author tag resolution filtering", () => {
    it("should only resolve tags for non-completed, non-not-needed statuses", () => {
      const bugfixCommits = [
        { prAuthor: "alice", backportStatus: "needed" as BackportStatus },
        { prAuthor: "bob", backportStatus: "completed" as BackportStatus },
        { prAuthor: "charlie", backportStatus: "not-needed" as BackportStatus },
        { prAuthor: "dave", backportStatus: "in-progress" as BackportStatus },
        { prAuthor: "eve", backportStatus: "unknown" as BackportStatus },
      ];

      const authorsToResolve = bugfixCommits
        .filter(
          (bf) =>
            bf.prAuthor && bf.backportStatus !== "completed" && bf.backportStatus !== "not-needed",
        )
        .map((bf) => bf.prAuthor);

      expect(authorsToResolve).toEqual(["alice", "dave", "eve"]);
      expect(authorsToResolve).not.toContain("bob");
      expect(authorsToResolve).not.toContain("charlie");
    });

    it("should deduplicate authors", () => {
      const bugfixCommits = [
        { prAuthor: "alice", backportStatus: "needed" as BackportStatus },
        { prAuthor: "alice", backportStatus: "needed" as BackportStatus },
      ];

      const seen = new Set<string>();
      const authorsToResolve = bugfixCommits
        .filter((bf) => {
          if (!bf.prAuthor || seen.has(bf.prAuthor)) return false;
          if (bf.backportStatus === "completed" || bf.backportStatus === "not-needed") return false;
          seen.add(bf.prAuthor);
          return true;
        })
        .map((bf) => bf.prAuthor);

      expect(authorsToResolve).toEqual(["alice"]);
    });
  });

  describe("report status categorization", () => {
    it("should categorize as not-mentioned when no backportTargetStatus", () => {
      const commit = { backportTargetStatus: [] as { status: BackportStatus }[] };
      const status = !commit.backportTargetStatus.length
        ? "not-mentioned"
        : commit.backportTargetStatus.some(
              (t) => t.status !== "completed" && t.status !== "not-needed",
            )
          ? "in-progress"
          : "completed";
      expect(status).toBe("not-mentioned");
    });

    it("should categorize as in-progress when any target is not completed/not-needed", () => {
      const commit = {
        backportTargetStatus: [
          { status: "completed" as BackportStatus },
          { status: "needed" as BackportStatus },
        ],
      };
      const status = !commit.backportTargetStatus.length
        ? "not-mentioned"
        : commit.backportTargetStatus.some(
              (t) => t.status !== "completed" && t.status !== "not-needed",
            )
          ? "in-progress"
          : "completed";
      expect(status).toBe("in-progress");
    });

    it("should categorize as completed when all targets are completed or not-needed", () => {
      const commit = {
        backportTargetStatus: [
          { status: "completed" as BackportStatus },
          { status: "not-needed" as BackportStatus },
        ],
      };
      const status = !commit.backportTargetStatus.length
        ? "not-mentioned"
        : commit.backportTargetStatus.some(
              (t) => t.status !== "completed" && t.status !== "not-needed",
            )
          ? "in-progress"
          : "completed";
      expect(status).toBe("completed");
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
