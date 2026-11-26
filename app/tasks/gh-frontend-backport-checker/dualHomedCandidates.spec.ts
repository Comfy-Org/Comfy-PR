import { describe, expect, it } from "bun:test";
import { dualHomedCandidateBranches } from "./dualHomedCandidates";

const branches = [
  "cloud/1.31",
  "core/1.6",
  "core/1.24.0-beta.0",
  "core/1.57",
  "cloud/1.58",
  "core/1.58",
  "core/1.59",
  "cloud/1.60",
  "core/1.60",
  "core/1.61",
];

describe("dualHomedCandidateBranches", () => {
  it("keeps the previous minor and newer for a minor release", () => {
    expect(dualHomedCandidateBranches(branches, "v1.59.0")).toEqual([
      "cloud/1.58",
      "core/1.58",
      "core/1.59",
      "cloud/1.60",
      "core/1.60",
      "core/1.61",
    ]);
  });

  it("drops branches cut long before a patch release", () => {
    expect(dualHomedCandidateBranches(branches, "v1.61.5")).toEqual(["cloud/1.60", "core/1.60", "core/1.61"]);
  });

  it("keeps every branch when the release tag has no minor", () => {
    expect(dualHomedCandidateBranches(branches, "nightly")).toEqual(branches);
  });

  it("keeps a branch whose minor cannot be parsed", () => {
    expect(dualHomedCandidateBranches(["core/next", "core/1.2"], "v1.40.0")).toEqual(["core/next"]);
  });
});
