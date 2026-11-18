import { describe, it, expect } from "bun:test";
import { branchCutPRsToLabel } from "./branchCutPRsToLabel";

const squash = (...messages: string[]) => messages.map((message) => ({ message, parents: 1 }));

describe("branchCutPRsToLabel", () => {
  it("skips a PR that is already labeled", () => {
    expect(branchCutPRsToLabel(squash("fix: a (#1)", "fix: b (#2)"), new Set([1]), 10)).toEqual([
      { prNumber: 2, subject: "fix: b (#2)" },
    ]);
  });

  it("labels a PR seen twice once, keeping the newest subject", () => {
    // listCommits returns newest first.
    expect(
      branchCutPRsToLabel(squash("fix: newer (#5)\n\nbody", "fix: older (#5)"), new Set(), 10),
    ).toEqual([{ prNumber: 5, subject: "fix: newer (#5)" }]);
  });

  it("ignores commits that name no PR", () => {
    expect(branchCutPRsToLabel(squash("1.58.0", "chore: direct push"), new Set(), 10)).toEqual([]);
  });

  it("caps one run and leaves the rest for the next run", () => {
    const messages = squash("a (#1)", "b (#2)", "c (#3)");
    const first = branchCutPRsToLabel(messages, new Set(), 2);
    expect(first.map((p) => p.prNumber)).toEqual([1, 2]);
    const labeled = new Set(first.map((p) => p.prNumber));
    expect(branchCutPRsToLabel(messages, labeled, 2).map((p) => p.prNumber)).toEqual([3]);
  });

  it("reads a merge commit by its prefix and a squash commit by its suffix", () => {
    expect(
      branchCutPRsToLabel(
        [
          { message: "Merge pull request #7 from a/topic-(#8)", parents: 2 },
          { message: "Merge pull request #9 from a/topic (#10)", parents: 1 },
        ],
        new Set(),
        10,
      ).map((p) => p.prNumber),
    ).toEqual([7, 10]);
  });
});
