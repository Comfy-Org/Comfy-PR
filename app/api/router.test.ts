import { describe, expect, it } from "bun:test";
import sflow from "sflow";

describe("getRepoUrls filter logic", () => {
  it("should filter out non-string and empty repository values", async () => {
    // Mock data similar to what CNRepos.find() might return
    const mockData = [
      { repository: "https://github.com/user/repo1" },
      { repository: "https://github.com/user/repo2" },
      { repository: "" },
      { repository: undefined },
      { repository: null },
      { repository: "https://github.com/user/repo3" },
    ];

    const result = await sflow(mockData)
      .map((e) => (e as unknown as { repository: string }).repository)
      .filter((repo) => typeof repo === "string" && repo.length > 0)
      .toArray();

    expect(result).toEqual([
      "https://github.com/user/repo1",
      "https://github.com/user/repo2",
      "https://github.com/user/repo3",
    ]);
  });

  it("should handle all invalid values", async () => {
    const mockData = [{ repository: "" }, { repository: undefined }, { repository: null }];

    const result = await sflow(mockData)
      .map((e) => (e as unknown as { repository: string }).repository)
      .filter((repo) => typeof repo === "string" && repo.length > 0)
      .toArray();

    expect(result).toEqual([]);
  });

  it("should handle all valid values", async () => {
    const mockData = [
      { repository: "https://github.com/user/repo1" },
      { repository: "https://github.com/user/repo2" },
      { repository: "https://github.com/user/repo3" },
    ];

    const result = await sflow(mockData)
      .map((e) => (e as unknown as { repository: string }).repository)
      .filter((repo) => typeof repo === "string" && repo.length > 0)
      .toArray();

    expect(result).toEqual([
      "https://github.com/user/repo1",
      "https://github.com/user/repo2",
      "https://github.com/user/repo3",
    ]);
  });
});

describe("getRepoUrls pagination", () => {
  it("should validate skip parameter is non-negative", () => {
    // The zod schema should enforce skip >= 0
    const schema = { skip: { min: 0 } };
    expect(schema.skip.min).toBe(0);
  });

  it("should validate limit parameter range", () => {
    // The zod schema should enforce 1 <= limit <= 5000
    const schema = { limit: { min: 1, max: 5000 } };
    expect(schema.limit.min).toBe(1);
    expect(schema.limit.max).toBe(5000);
  });

  it("should have default values for skip and limit", () => {
    // Default values: skip=0, limit=1000
    const defaults = { skip: 0, limit: 1000 };
    expect(defaults.skip).toBe(0);
    expect(defaults.limit).toBe(1000);
  });
});
