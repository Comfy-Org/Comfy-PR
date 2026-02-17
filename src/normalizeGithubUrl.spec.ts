import { describe, expect, test } from "bun:test";
import {
  normalizeGithubUrl,
  normalizeGithubUrls,
  normalizeGithubUrlsInObject,
} from "./normalizeGithubUrl";

describe("normalizeGithubUrl", () => {
  test("should normalize comfyanonymous to Comfy-Org", () => {
    const url = "https://github.com/comfyanonymous/ComfyUI/issues/123";
    const expected = "https://github.com/Comfy-Org/ComfyUI/issues/123";
    expect(normalizeGithubUrl(url)).toBe(expected);
  });

  test("should handle already normalized URLs", () => {
    const url = "https://github.com/Comfy-Org/ComfyUI/issues/123";
    expect(normalizeGithubUrl(url)).toBe(url);
  });

  test("should be case insensitive", () => {
    const url = "https://github.com/ComfyAnonymous/ComfyUI/issues/123";
    const expected = "https://github.com/Comfy-Org/ComfyUI/issues/123";
    expect(normalizeGithubUrl(url)).toBe(expected);
  });

  test("should handle pull request URLs", () => {
    const url = "https://github.com/comfyanonymous/ComfyUI/pull/456";
    const expected = "https://github.com/Comfy-Org/ComfyUI/pull/456";
    expect(normalizeGithubUrl(url)).toBe(expected);
  });

  test("should handle comment URLs", () => {
    const url = "https://github.com/comfyanonymous/ComfyUI/issues/123#issuecomment-456789";
    const expected = "https://github.com/Comfy-Org/ComfyUI/issues/123#issuecomment-456789";
    expect(normalizeGithubUrl(url)).toBe(expected);
  });

  test("should handle release URLs", () => {
    const url = "https://github.com/comfyanonymous/ComfyUI/releases/tag/v1.0.0";
    const expected = "https://github.com/Comfy-Org/ComfyUI/releases/tag/v1.0.0";
    expect(normalizeGithubUrl(url)).toBe(expected);
  });

  test("should not affect other GitHub repos (Comfy-Org)", () => {
    const url = "https://github.com/Comfy-Org/ComfyUI_frontend/issues/123";
    expect(normalizeGithubUrl(url)).toBe(url);
  });

  test("should not affect other comfyanonymous repos", () => {
    // Only ComfyUI was migrated — other hypothetical repos under comfyanonymous should be untouched
    const url = "https://github.com/comfyanonymous/some-other-repo/issues/1";
    expect(normalizeGithubUrl(url)).toBe(url);
  });

  test("should handle repo URL without trailing path", () => {
    const url = "https://github.com/comfyanonymous/ComfyUI";
    const expected = "https://github.com/Comfy-Org/ComfyUI";
    expect(normalizeGithubUrl(url)).toBe(expected);
  });

  test("should handle empty string", () => {
    expect(normalizeGithubUrl("")).toBe("");
  });

  test("should handle non-GitHub URLs", () => {
    const url = "https://example.com/path";
    expect(normalizeGithubUrl(url)).toBe(url);
  });
});

describe("normalizeGithubUrls", () => {
  test("should normalize multiple URLs", () => {
    const urls = [
      "https://github.com/comfyanonymous/ComfyUI/issues/123",
      "https://github.com/Comfy-Org/ComfyUI/issues/456",
      "https://github.com/comfyanonymous/ComfyUI/pull/789",
    ];
    const expected = [
      "https://github.com/Comfy-Org/ComfyUI/issues/123",
      "https://github.com/Comfy-Org/ComfyUI/issues/456",
      "https://github.com/Comfy-Org/ComfyUI/pull/789",
    ];
    expect(normalizeGithubUrls(urls)).toEqual(expected);
  });

  test("should handle empty array", () => {
    expect(normalizeGithubUrls([])).toEqual([]);
  });
});

describe("normalizeGithubUrlsInObject", () => {
  test("should normalize URL fields in object", () => {
    const obj = {
      sourceIssueUrl: "https://github.com/comfyanonymous/ComfyUI/issues/123",
      targetIssueUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/456",
      otherField: "not a url",
    };
    const result = normalizeGithubUrlsInObject(obj, ["sourceIssueUrl", "targetIssueUrl"]);
    expect(result.sourceIssueUrl).toBe("https://github.com/Comfy-Org/ComfyUI/issues/123");
    expect(result.targetIssueUrl).toBe("https://github.com/Comfy-Org/ComfyUI_frontend/issues/456");
    expect(result.otherField).toBe("not a url");
  });

  test("should not modify non-URL fields", () => {
    const obj = {
      url: "https://github.com/comfyanonymous/ComfyUI/issues/123",
      count: 42,
      flag: true,
    };
    const result = normalizeGithubUrlsInObject(obj, ["url"]);
    expect(result.url).toBe("https://github.com/Comfy-Org/ComfyUI/issues/123");
    expect(result.count).toBe(42);
    expect(result.flag).toBe(true);
  });

  test("should handle objects with no URL fields", () => {
    const obj = { name: "test", value: 123 };
    const result = normalizeGithubUrlsInObject(obj, []);
    expect(result).toEqual(obj);
  });

  test("should create a new object (not mutate)", () => {
    const obj = {
      url: "https://github.com/comfyanonymous/ComfyUI/issues/123",
    };
    const result = normalizeGithubUrlsInObject(obj, ["url"]);
    expect(result).not.toBe(obj);
    expect(obj.url).toBe("https://github.com/comfyanonymous/ComfyUI/issues/123");
    expect(result.url).toBe("https://github.com/Comfy-Org/ComfyUI/issues/123");
  });
});
