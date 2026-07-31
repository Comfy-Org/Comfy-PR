import { describe, expect, it } from "bun:test";
import { isCommitInTag, isTagOnLine, resolveShippedStatus } from "./releasedStatus";

describe("isCommitInTag", () => {
  it("treats a commit contained by the tag as released", () => {
    // compareCommits(base: tag, head: commit): the commit is an ancestor of the
    // tag, so the tag already carries it.
    expect(isCommitInTag("identical")).toBe(true);
    expect(isCommitInTag("behind")).toBe(true);
  });

  it("treats a commit past the tag as unreleased", () => {
    expect(isCommitInTag("ahead")).toBe(false);
    expect(isCommitInTag("diverged")).toBe(false);
  });
});

describe("resolveShippedStatus", () => {
  it("reports merged-unreleased when the backport landed but no tag carries it", () => {
    // The exact 1.47.10 state: #14065 merged onto core/1.47 after v1.47.10 was cut.
    expect(resolveShippedStatus({ backportStatus: "completed", releasedInTag: null })).toBe(
      "merged-unreleased",
    );
  });

  it("reports completed once a tag carries the commit", () => {
    expect(resolveShippedStatus({ backportStatus: "completed", releasedInTag: "v1.47.11" })).toBe(
      "completed",
    );
  });

  it("leaves a still-unmerged backport alone", () => {
    expect(resolveShippedStatus({ backportStatus: "needed", releasedInTag: null })).toBe("needed");
    expect(resolveShippedStatus({ backportStatus: "in-progress", releasedInTag: null })).toBe(
      "in-progress",
    );
  });
});

describe("isTagOnLine", () => {
  it("matches tags on the same release line", () => {
    expect(isTagOnLine("v1.47.11", "core/1.47")).toBe(true);
    expect(isTagOnLine("cloud/v1.47.7", "cloud/1.47")).toBe(true);
  });

  it("does not let a shorter line swallow a longer one", () => {
    // core/1.4 must not match v1.40.0 — that would mark an unrelated line shipped.
    expect(isTagOnLine("v1.40.0", "core/1.4")).toBe(false);
    expect(isTagOnLine("v1.470.0", "core/1.47")).toBe(false);
  });

  it("rejects tags from other lines", () => {
    expect(isTagOnLine("v1.48.5", "core/1.47")).toBe(false);
  });
});
