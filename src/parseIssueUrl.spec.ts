import { parseIssueUrl } from "./parseIssueUrl";

describe("parseIssueUrl", () => {
  it("should parse a valid pull request URL", () => {
    const url = "https://github.com/owner/repo/pull/123";
    const result = parseIssueUrl(url);

    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      issue_number: 123,
    });
  });

  it("should parse a valid issue URL", () => {
    const url = "https://github.com/owner/repo/issues/456";
    const result = parseIssueUrl(url);

    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      issue_number: 456,
    });
  });

  it("should handle owner and repo names with hyphens", () => {
    const url = "https://github.com/my-org/my-repo/pull/789";
    const result = parseIssueUrl(url);

    expect(result).toEqual({
      owner: "my-org",
      repo: "my-repo",
      issue_number: 789,
    });
  });

  it("should handle numeric issue numbers correctly", () => {
    const url = "https://github.com/test/test/issues/1";
    const result = parseIssueUrl(url);

    expect(result).toEqual({
      owner: "test",
      repo: "test",
      issue_number: 1,
    });
  });

  it("should handle large issue numbers", () => {
    const url = "https://github.com/test/test/pull/999999";
    const result = parseIssueUrl(url);

    expect(result).toEqual({
      owner: "test",
      repo: "test",
      issue_number: 999999,
    });
  });

  it("should throw an error for invalid URL format", () => {
    const invalidUrl = "https://github.com/owner/repo/invalid/123";

    expect(() => parseIssueUrl(invalidUrl)).toThrow();
  });

  it("should throw an error for non-GitHub URLs", () => {
    const invalidUrl = "https://gitlab.com/owner/repo/pull/123";

    expect(() => parseIssueUrl(invalidUrl)).toThrow();
  });

  it("should throw an error for URLs without issue/pull number", () => {
    const invalidUrl = "https://github.com/owner/repo/pull/";

    expect(() => parseIssueUrl(invalidUrl)).toThrow();
  });

  it("should throw an error for URLs with non-numeric issue numbers", () => {
    const invalidUrl = "https://github.com/owner/repo/pull/abc";

    expect(() => parseIssueUrl(invalidUrl)).toThrow();
  });

  it("should throw an error for incomplete URLs", () => {
    const invalidUrl = "https://github.com/owner";

    expect(() => parseIssueUrl(invalidUrl)).toThrow();
  });

  it("should handle URLs with trailing slashes", () => {
    // The function handles trailing slashes correctly
    const url = "https://github.com/owner/repo/pull/123/";

    const result = parseIssueUrl(url);
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
    expect(result.issue_number).toBe(123);
  });
});
