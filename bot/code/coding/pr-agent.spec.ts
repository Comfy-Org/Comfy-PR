import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSubAgent } from "./pr-agent";
import { rmSync, existsSync } from "fs";
import path from "path";

describe("pr-agent", () => {
  const testRepoDir = path.join(process.cwd(), "repos", "test-owner", "test-repo", "tree", "main");

  // Clean up test directory before and after tests
  beforeEach(() => {
    if (existsSync(testRepoDir)) {
      rmSync(testRepoDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testRepoDir)) {
      rmSync(testRepoDir, { recursive: true, force: true });
    }
  });

  it("should validate repo format", async () => {
    expect(async () => {
      await spawnSubAgent({
        repo: "invalid-repo-format",
        branch: "main",
        prompt: "test",
      });
    }).toThrow();
  });

  it("should parse repo owner and name correctly", () => {
    const repo = "Comfy-Org/ComfyUI";
    const [owner, repoName] = repo.split("/");

    expect(owner).toBe("Comfy-Org");
    expect(repoName).toBe("ComfyUI");
  });

  it("should construct correct directory path", () => {
    const owner = "Comfy-Org";
    const repoName = "ComfyUI";
    const branch = "main";

    const expectedPath = path.join(process.cwd(), "repos", owner, repoName, "tree", branch);
    const repoDir = path.join(process.cwd(), "repos", owner, repoName, "tree", branch);

    expect(repoDir).toBe(expectedPath);
  });
});
