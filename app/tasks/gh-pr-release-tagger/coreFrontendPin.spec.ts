import { describe, expect, it } from "bun:test";
import { coreFrontendPin } from "./coreFrontendPin";

describe("coreFrontendPin", () => {
  it("reads the exact frontend pin and its release branch", () => {
    const requirements = "torch\ncomfyui-frontend-package==1.59.6\ncomfyui-workflow-templates==0.9.1\n";
    expect(coreFrontendPin(requirements)).toEqual({ tag: "v1.59.6", branch: "core/1.59" });
  });

  it("accepts underscores, spacing and a trailing comment", () => {
    expect(coreFrontendPin("comfyui_frontend_package == 1.60.2  # pinned\n")).toEqual({
      tag: "v1.60.2",
      branch: "core/1.60",
    });
  });

  it("ignores other packages that share the prefix", () => {
    expect(coreFrontendPin("comfyui-frontend-package-extra==2.0.0\n")).toBeNull();
  });

  it("returns null without an exact pin", () => {
    expect(coreFrontendPin("comfyui-frontend-package>=1.59.0\n")).toBeNull();
    expect(coreFrontendPin("")).toBeNull();
  });
});
