import { describe, expect, it } from "bun:test";
import { getReleaseComparison } from "./releaseComparison";

const repositoryUrl = "https://github.com/Comfy-Org/ComfyUI_frontend";

describe("backport-checker release comparison metadata", () => {
  it("skips a candidate release without a comparison link", () => {
    expect(
      getReleaseComparison(
        {
          prerelease: false,
          bodyUrls: ["https://github.com/Comfy-Org/ComfyUI_frontend/pull/13953"],
        },
        repositoryUrl,
      ),
    ).toBeNull();
  });

  it("keeps a prerelease eligible when it has a comparison link", () => {
    const compareLink =
      "https://github.com/Comfy-Org/ComfyUI_frontend/compare/v1.49.0...v1.49.0-rc.1";

    expect(
      getReleaseComparison(
        {
          prerelease: true,
          bodyUrls: [compareLink],
        },
        repositoryUrl,
      ),
    ).toEqual({ compareLink });
  });
});
