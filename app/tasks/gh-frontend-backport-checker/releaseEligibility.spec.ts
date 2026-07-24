import { describe, expect, it } from "bun:test";
import { shouldCheckRelease } from "./releaseEligibility";

describe("backport-checker release eligibility", () => {
  it("checks stable published releases", () => {
    expect(shouldCheckRelease({ draft: false, prerelease: false })).toBe(true);
  });

  it("skips drafts and prereleases before parsing changelog metadata", () => {
    expect(shouldCheckRelease({ draft: true, prerelease: false })).toBe(false);
    expect(shouldCheckRelease({ draft: false, prerelease: true })).toBe(false);
  });
});
