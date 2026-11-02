import { describe, it, expect } from "bun:test";
import { branchCutCandidates } from "./branchCutCandidates";

const fork = new Date("2026-10-20T12:00:00Z");

describe("branchCutCandidates", () => {
  it("keeps a main PR merged before the fork point, which only arrived by branch cut", () => {
    const pr = { number: 18700, merged_at: "2026-09-29T07:29:15Z", merge_commit_sha: "888e079e" };
    expect(branchCutCandidates([pr], fork, new Set())).toEqual([pr]);
  });

  it("drops a main PR merged after the fork point: it needs a backport to reach the branch", () => {
    const pr = { number: 21527, merged_at: "2026-10-22T00:23:13Z", merge_commit_sha: "bc0250c6" };
    expect(branchCutCandidates([pr], fork, new Set())).toEqual([]);
  });

  it("drops closed-unmerged PRs and PRs without a merge commit", () => {
    const prs = [
      { number: 1, merged_at: null, merge_commit_sha: "abc" },
      { number: 2, merged_at: "2026-10-01T00:00:00Z", merge_commit_sha: null },
    ];
    expect(branchCutCandidates(prs, fork, new Set())).toEqual([]);
  });

  it("drops PRs already labeled", () => {
    const pr = { number: 18074, merged_at: "2026-09-20T00:00:00Z", merge_commit_sha: "def" };
    expect(branchCutCandidates([pr], fork, new Set([18074]))).toEqual([]);
  });

  it("keeps a PR merged exactly at the fork point", () => {
    const pr = { number: 3, merged_at: fork.toISOString(), merge_commit_sha: "f0f0" };
    expect(branchCutCandidates([pr], fork, new Set())).toEqual([pr]);
  });
});
