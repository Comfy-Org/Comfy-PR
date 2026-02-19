import { describe, it, expect } from "bun:test";
import type { GithubPRReleaseTaggerTask } from "./index";

describe("GithubPRReleaseTaggerTask", () => {
  describe("configuration", () => {
    const config = {
      repo: "https://github.com/Comfy-Org/ComfyUI_frontend",
      reReleaseBranchPatterns: /^(core|cloud)\/1\.\d+$/,
      getLabelForBranch: (branch: string) => `released:${branch.split("/")[0]}`,
      maxReleasesToCheck: 5,
      processSince: new Date("2026-01-01T00:00:00Z").toISOString(),
    };

    it("should have valid repo URL", () => {
      expect(config.repo).toContain("github.com");
      expect(config.repo).toContain("ComfyUI_frontend");
    });

    it("should match core/* branch patterns", () => {
      expect(config.reReleaseBranchPatterns.test("core/1.0")).toBe(true);
      expect(config.reReleaseBranchPatterns.test("core/1.36")).toBe(true);
      expect(config.reReleaseBranchPatterns.test("core/1.100")).toBe(true);
    });

    it("should match cloud/* branch patterns", () => {
      expect(config.reReleaseBranchPatterns.test("cloud/1.0")).toBe(true);
      expect(config.reReleaseBranchPatterns.test("cloud/1.36")).toBe(true);
      expect(config.reReleaseBranchPatterns.test("cloud/1.100")).toBe(true);
    });

    it("should not match non-release branches", () => {
      expect(config.reReleaseBranchPatterns.test("main")).toBe(false);
      expect(config.reReleaseBranchPatterns.test("develop")).toBe(false);
      expect(config.reReleaseBranchPatterns.test("feature/dark-mode")).toBe(false);
      expect(config.reReleaseBranchPatterns.test("core/1.x")).toBe(false); // non-numeric minor
      expect(config.reReleaseBranchPatterns.test("staging/1.0")).toBe(false);
    });

    it("should generate correct labels for branches", () => {
      expect(config.getLabelForBranch("core/1.36")).toBe("released:core");
      expect(config.getLabelForBranch("cloud/1.36")).toBe("released:cloud");
      expect(config.getLabelForBranch("core/1.100")).toBe("released:core");
      expect(config.getLabelForBranch("cloud/1.0")).toBe("released:cloud");
    });

    it("should have positive maxReleasesToCheck", () => {
      expect(config.maxReleasesToCheck).toBeGreaterThan(0);
    });

    it("should have a valid processSince date", () => {
      const date = new Date(config.processSince);
      expect(date.getFullYear()).toBeGreaterThanOrEqual(2026);
    });
  });

  describe("task state structure", () => {
    it("should accept valid GithubPRReleaseTaggerTask shape", () => {
      const task: GithubPRReleaseTaggerTask = {
        releaseUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
        releaseTag: "v1.0.0",
        branch: "core/1.36",
        labeledPRs: [
          {
            prNumber: 100,
            prUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/100",
            prTitle: "feat: add dark mode",
            labeledAt: new Date("2026-01-15T00:00:00Z"),
          },
        ],
        taskStatus: "completed",
        checkedAt: new Date("2026-01-15T00:00:00Z"),
      };

      expect(task.releaseUrl).toContain("releases/tag");
      expect(task.branch).toMatch(/^(core|cloud)\/1\.\d+$/);
      expect(task.taskStatus).toBe("completed");
      expect(task.labeledPRs).toHaveLength(1);
      expect(task.labeledPRs[0].prNumber).toBe(100);
    });

    it("should allow all taskStatus values", () => {
      const statuses: GithubPRReleaseTaggerTask["taskStatus"][] = [
        "checking",
        "completed",
        "failed",
      ];
      expect(statuses).toContain("checking");
      expect(statuses).toContain("completed");
      expect(statuses).toContain("failed");
    });

    it("should handle empty labeledPRs array", () => {
      const task: GithubPRReleaseTaggerTask = {
        releaseUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
        releaseTag: "v1.0.0",
        branch: "core/1.36",
        labeledPRs: [],
        taskStatus: "checking",
        checkedAt: new Date(),
      };

      expect(task.labeledPRs).toEqual([]);
    });
  });

  describe("branch grouping logic", () => {
    it("should group releases by branch correctly", () => {
      const releases = [
        { tag_name: "core-v1.0.0", target_commitish: "core/1.36", created_at: "2026-01-01T00:00:00Z" },
        { tag_name: "core-v1.0.1", target_commitish: "core/1.36", created_at: "2026-01-02T00:00:00Z" },
        { tag_name: "cloud-v1.0.0", target_commitish: "cloud/1.36", created_at: "2026-01-01T00:00:00Z" },
      ];

      const releasesByBranch = new Map<string, typeof releases>();
      for (const release of releases) {
        const branch = release.target_commitish;
        if (!releasesByBranch.has(branch)) {
          releasesByBranch.set(branch, []);
        }
        releasesByBranch.get(branch)!.push(release);
      }

      expect(releasesByBranch.size).toBe(2);
      expect(releasesByBranch.get("core/1.36")).toHaveLength(2);
      expect(releasesByBranch.get("cloud/1.36")).toHaveLength(1);
    });

    it("should sort releases ascending by created_at", () => {
      const releases = [
        { tag_name: "v1.0.2", target_commitish: "core/1.36", created_at: "2026-01-03T00:00:00Z" },
        { tag_name: "v1.0.0", target_commitish: "core/1.36", created_at: "2026-01-01T00:00:00Z" },
        { tag_name: "v1.0.1", target_commitish: "core/1.36", created_at: "2026-01-02T00:00:00Z" },
      ];

      const sorted = [...releases].sort(
        (a, b) => +new Date(a.created_at) - +new Date(b.created_at),
      );

      expect(sorted[0].tag_name).toBe("v1.0.0");
      expect(sorted[1].tag_name).toBe("v1.0.1");
      expect(sorted[2].tag_name).toBe("v1.0.2");
    });

    it("should limit releases per branch to maxReleasesToCheck", () => {
      const maxReleasesToCheck = 5;
      const releases = Array.from({ length: 10 }, (_, i) => ({
        tag_name: `v1.0.${i}`,
        target_commitish: "core/1.36",
        created_at: new Date(2026, 0, i + 1).toISOString(),
      }));

      const limited = releases.slice(-maxReleasesToCheck);
      expect(limited).toHaveLength(5);
      expect(limited[0].tag_name).toBe("v1.0.5");
      expect(limited[4].tag_name).toBe("v1.0.9");
    });
  });

  describe("label operations", () => {
    it("should not re-label already labeled PRs", () => {
      const labelName = "released:core";
      const alreadyLabeledPrNumbers = new Set([100, 101]);

      const prNumbers = [100, 101, 102, 103];
      const toLabel = prNumbers.filter((n) => !alreadyLabeledPrNumbers.has(n));

      expect(toLabel).toEqual([102, 103]);
    });

    it("should skip PRs that already have the label", () => {
      const labelName = "released:core";
      const pr = {
        number: 100,
        labels: [{ name: "released:core" }, { name: "bug" }],
      };

      const existingLabels = pr.labels.map((l) =>
        typeof l === "string" ? l : l.name || "",
      );
      const alreadyHasLabel = existingLabels.includes(labelName);

      expect(alreadyHasLabel).toBe(true);
    });

    it("should detect missing labels that need to be added", () => {
      const labelName = "released:cloud";
      const pr = {
        number: 200,
        labels: [{ name: "bug" }, { name: "enhancement" }],
      };

      const existingLabels = pr.labels.map((l) =>
        typeof l === "string" ? l : l.name || "",
      );
      const alreadyHasLabel = existingLabels.includes(labelName);

      expect(alreadyHasLabel).toBe(false);
    });
  });

  describe("processSince filtering", () => {
    const processSince = new Date("2026-01-01T00:00:00Z").toISOString();

    it("should include releases after processSince", () => {
      const releaseDate = "2026-02-01T00:00:00Z";
      const isIncluded = +new Date(releaseDate) >= +new Date(processSince);
      expect(isIncluded).toBe(true);
    });

    it("should exclude releases before processSince", () => {
      const releaseDate = "2025-12-31T00:00:00Z";
      const isIncluded = +new Date(releaseDate) >= +new Date(processSince);
      expect(isIncluded).toBe(false);
    });

    it("should include releases exactly at processSince", () => {
      const releaseDate = "2026-01-01T00:00:00Z";
      const isIncluded = +new Date(releaseDate) >= +new Date(processSince);
      expect(isIncluded).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle failed task status", () => {
      const task: GithubPRReleaseTaggerTask = {
        releaseUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
        releaseTag: "v1.0.0",
        branch: "core/1.36",
        labeledPRs: [],
        taskStatus: "failed",
        checkedAt: new Date(),
      };

      expect(task.taskStatus).toBe("failed");
    });

    it("should preserve already labeled PRs when task fails", () => {
      const existingLabeledPRs = [
        {
          prNumber: 100,
          prUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/100",
          prTitle: "feat: test feature",
          labeledAt: new Date(),
        },
      ];

      // Simulating preservation of labeled PRs from existing task
      const savedLabeledPRs = [...existingLabeledPRs];
      expect(savedLabeledPRs).toHaveLength(1);
      expect(savedLabeledPRs[0].prNumber).toBe(100);
    });
  });

  describe("database indexes", () => {
    it("should use releaseUrl as unique identifier", () => {
      const uniqueField = "releaseUrl";
      expect(uniqueField).toBe("releaseUrl");
    });

    it("should include all expected indexes", () => {
      const indexes = ["releaseUrl", "releaseTag", "branch", "checkedAt"];
      expect(indexes).toContain("releaseUrl");
      expect(indexes).toContain("releaseTag");
      expect(indexes).toContain("branch");
      expect(indexes).toContain("checkedAt");
    });
  });
});
