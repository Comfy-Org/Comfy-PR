import { describe, it, expect } from "bun:test";
import { isReleasedCompareStatus } from "./isReleasedCompareStatus";

describe("isReleasedCompareStatus", () => {
  it("returns true for 'behind' (merge commit is an ancestor of deployed ref)", () => {
    expect(isReleasedCompareStatus("behind")).toBe(true);
  });

  it("returns true for 'identical' (merge commit IS the deployed ref)", () => {
    expect(isReleasedCompareStatus("identical")).toBe(true);
  });

  it("returns false for 'ahead' (merge commit is ahead, not yet deployed)", () => {
    expect(isReleasedCompareStatus("ahead")).toBe(false);
  });

  it("returns false for 'diverged' (histories disagree)", () => {
    expect(isReleasedCompareStatus("diverged")).toBe(false);
  });

  it("returns false for unexpected values", () => {
    expect(isReleasedCompareStatus("")).toBe(false);
    expect(isReleasedCompareStatus("unknown")).toBe(false);
  });
});
