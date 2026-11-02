import { describe, it, expect } from "bun:test";
import { prNumberFromMainCommit } from "./prNumberFromMainCommit";

describe("prNumberFromMainCommit", () => {
  it("reads a squash-merged PR, which reaches a release branch only through its cut", () => {
    expect(
      prNumberFromMainCommit(
        "refactor(agent): apply remote CRDT ops through the graph API and delete the reconcile layer (#18700)\n\n## Summary",
      ),
    ).toBe(18700);
  });

  it("reads a classic merge commit", () => {
    expect(prNumberFromMainCommit("Merge pull request #217 from Comfy-Org/chore/x\n\nbody")).toBe(
      217,
    );
  });

  it("uses the last reference in the subject, not one mentioned earlier", () => {
    expect(
      prNumberFromMainCommit("fix: revert incorrectly backported code from #9908 (#10024)"),
    ).toBe(10024);
  });

  it("names no PR for a commit without one", () => {
    expect(prNumberFromMainCommit("1.58.0")).toBeNull();
    expect(prNumberFromMainCommit("chore: bump (#abc)")).toBeNull();
    expect(prNumberFromMainCommit("fix: thing\n\nsee (#123)")).toBeNull();
  });
});
