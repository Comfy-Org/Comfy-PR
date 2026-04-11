import { describe, it, expect } from "bun:test";
import { extractOriginalPRNumber } from "./extractOriginalPRNumber";
import type { PRReleaseTaggerState } from "./index";

describe("PRReleaseTaggerState", () => {
  describe("extractOriginalPRNumber", () => {
    it("should extract PR number from standard backport body", () => {
      const body =
        "Backport of #9937 to `core/1.41`\n\nAutomatically created by backport workflow.";
      expect(extractOriginalPRNumber(body)).toBe(9937);
    });

    it("should extract PR number from cloud backport body", () => {
      const body =
        "Backport of #10111 to `cloud/1.42`\n\nAutomatically created by backport workflow.";
      expect(extractOriginalPRNumber(body)).toBe(10111);
    });

    it("should return null for non-backport PRs", () => {
      expect(extractOriginalPRNumber("Some regular PR body")).toBeNull();
      expect(extractOriginalPRNumber("")).toBeNull();
      expect(extractOriginalPRNumber(null)).toBeNull();
    });

    it("should handle PR body with only the reference", () => {
      expect(extractOriginalPRNumber("Backport of #1")).toBe(1);
      expect(extractOriginalPRNumber("Backport of #99999")).toBe(99999);
    });

    it("should extract from title-style backport with branch tag", () => {
      expect(
        extractOriginalPRNumber(
          null,
          "[backport core/1.41] feat: show App/Node Graph type indicator on template cards (#9758)",
        ),
      ).toBe(9758);
      expect(
        extractOriginalPRNumber(
          "irrelevant body",
          "[backport cloud/1.41] feat: add server-side PostHog config overrides (#9758)",
        ),
      ).toBe(9758);
    });

    it("should extract from bracket-prefixed branch title", () => {
      expect(
        extractOriginalPRNumber(
          null,
          "[cloud/1.41] fix: revert incorrectly backported code from #9908 (#10024)",
        ),
      ).toBe(10024);
    });

    it("should prefer body over title when both present", () => {
      expect(
        extractOriginalPRNumber("Backport of #1234", "[backport core/1.41] feat: x (#9999)"),
      ).toBe(1234);
    });

    it("should return null for version-bump titles", () => {
      expect(extractOriginalPRNumber(null, "1.41.17")).toBeNull();
      expect(extractOriginalPRNumber("Release 1.41.17", "1.41.17")).toBeNull();
    });
  });

  describe("state structure", () => {
    it("should accept valid PRReleaseTaggerState shape", () => {
      const state: PRReleaseTaggerState = {
        target: "core",
        deployedRef: "v1.41.21",
        branch: "core/1.41",
        labeledOriginalPRs: [
          {
            prNumber: 9937,
            prUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/9937",
            prTitle: "fix: prevent live preview dimension flicker between frames",
            backportPrNumber: 9955,
            labeledAt: new Date("2026-01-15T00:00:00Z"),
          },
        ],
        taskStatus: "completed",
        checkedAt: new Date("2026-01-15T00:00:00Z"),
      };

      expect(state.target).toBe("core");
      expect(state.deployedRef).toBe("v1.41.21");
      expect(state.labeledOriginalPRs).toHaveLength(1);
      expect(state.labeledOriginalPRs[0].backportPrNumber).toBe(9955);
    });

    it("should handle cloud state with SHA ref", () => {
      const state: PRReleaseTaggerState = {
        target: "cloud",
        deployedRef: "8983fdd49d8366544e5344c57501442279cb6b96",
        branch: "cloud/1.41",
        labeledOriginalPRs: [],
        taskStatus: "completed",
        checkedAt: new Date(),
      };

      expect(state.target).toBe("cloud");
      expect(state.deployedRef).toMatch(/^[0-9a-f]{40}$/);
    });

    it("should handle direct PRs (no backport)", () => {
      const state: PRReleaseTaggerState = {
        target: "core",
        deployedRef: "v1.41.21",
        branch: "core/1.41",
        labeledOriginalPRs: [
          {
            prNumber: 500,
            prUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/500",
            prTitle: "fix: directly on core branch",
            backportPrNumber: null,
            labeledAt: new Date(),
          },
        ],
        taskStatus: "completed",
        checkedAt: new Date(),
      };

      expect(state.labeledOriginalPRs[0].backportPrNumber).toBeNull();
    });

    it("should allow all taskStatus values", () => {
      const statuses: PRReleaseTaggerState["taskStatus"][] = ["checking", "completed", "failed"];
      expect(statuses).toContain("checking");
      expect(statuses).toContain("completed");
      expect(statuses).toContain("failed");
    });
  });
});
