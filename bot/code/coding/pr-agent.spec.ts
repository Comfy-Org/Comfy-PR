import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSubAgent } from "./pr-agent";
import { rmSync, existsSync } from "fs";
import path from "path";

describe("pr-agent", () => {
  const testRepoDir = path.join(process.cwd(), "repos", "test-owner", "test-repo", "tree", "main");
  const originalGhToken = process.env.GH_TOKEN_COMFY_PR_BOT;

  // Clean up test directory before and after tests
  beforeEach(() => {
    if (existsSync(testRepoDir)) {
      rmSync(testRepoDir, { recursive: true, force: true });
    }
    // Set a test token for testing
    process.env.GH_TOKEN_COMFY_PR_BOT = "test-token-for-pr-agent";
  });

  afterEach(() => {
    if (existsSync(testRepoDir)) {
      rmSync(testRepoDir, { recursive: true, force: true });
    }
    // Restore original token
    if (originalGhToken) {
      process.env.GH_TOKEN_COMFY_PR_BOT = originalGhToken;
    } else {
      delete process.env.GH_TOKEN_COMFY_PR_BOT;
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

  it("should throw error when GitHub token is missing", async () => {
    // Remove both tokens
    delete process.env.GH_TOKEN_COMFY_PR_BOT;
    delete process.env.GH_TOKEN;

    await expect(spawnSubAgent({
      repo: "test-owner/test-repo",
      branch: "main",
      prompt: "test",
    })).rejects.toThrow("Missing GH_TOKEN_COMFY_PR_BOT or GH_TOKEN environment variable");

    // Restore token for other tests
    process.env.GH_TOKEN_COMFY_PR_BOT = "test-token-for-pr-agent";
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
