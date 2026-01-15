import { http, HttpResponse } from "msw";
import { server } from "./test/msw-setup";

// Import the GitHub client
// Note: We need to mock the environment variable before importing
process.env.GH_TOKEN = "test-token-for-gh-spec";

// Dynamic import to ensure env var is set
const ghModule = await import("./ghc");
const { gh } = await import("./ghc");
const { ghc, clearGhCache } = ghModule;

describe("GitHub API Client (gh)", () => {
  beforeEach(async () => {
    // Clear cache before each test to ensure clean state
    await clearGhCache();
  });

  describe("Repos API", () => {
    it("should get a repository", async () => {
      const result = await gh.repos.get({
        owner: "octocat",
        repo: "Hello-World",
      });

      expect(result.data).toBeDefined();
      expect(result.data.name).toBe("Hello-World");
      expect(result.data.owner.login).toBe("octocat");
      expect(result.data.default_branch).toBe("main");
    });

    it("should create a fork", async () => {
      const result = await gh.repos.createFork({
        owner: "octocat",
        repo: "Hello-World",
        organization: "test-org",
        name: "Hello-World-fork",
      });

      expect(result.data).toBeDefined();
      expect(result.data.fork).toBe(true);
      expect(result.data.owner.login).toBe("test-org");
      expect(result.data.name).toBe("Hello-World-fork");
    });

    it("should get a branch", async () => {
      const result = await gh.repos.getBranch({
        owner: "octocat",
        repo: "Hello-World",
        branch: "main",
      });

      expect(result.data).toBeDefined();
      expect(result.data.name).toBe("main");
      expect(result.data.commit.sha).toBeDefined();
    });

    it("should list tags", async () => {
      const result = await gh.repos.listTags({
        owner: "comfyanonymous",
        repo: "ComfyUI",
        per_page: 10,
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].name).toBeDefined();
      expect(result.data[0].commit.sha).toBeDefined();
    });

    it("should get a commit", async () => {
      const result = await gh.repos.getCommit({
        owner: "octocat",
        repo: "Hello-World",
        ref: "abc123def456",
      });

      expect(result.data).toBeDefined();
      expect(result.data.commit.author!.date).toBeDefined();
      expect(result.data.commit.message).toBeDefined();
    });

    it("should list releases", async () => {
      const result = await gh.repos.listReleases({
        owner: "Comfy-Org",
        repo: "desktop",
        per_page: 3,
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].tag_name).toBeDefined();
    });

    it("should list webhooks", async () => {
      const result = await gh.repos.listWebhooks({
        owner: "octocat",
        repo: "Hello-World",
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should create a webhook", async () => {
      const result = await gh.repos.createWebhook({
        owner: "octocat",
        repo: "Hello-World",
        config: {
          url: "https://example.com/webhook",
          content_type: "json",
        },
        events: ["push", "pull_request"],
      });

      expect(result.data).toBeDefined();
      expect(result.data.config.url).toBe("https://example.com/webhook");
      expect(result.data.events).toContain("push");
    });
  });

  describe("Pulls API", () => {
    it("should list pull requests", async () => {
      const result = await gh.pulls.list({
        owner: "octocat",
        repo: "Hello-World",
        state: "all",
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it("should filter pull requests by state", async () => {
      const result = await gh.pulls.list({
        owner: "octocat",
        repo: "Hello-World",
        state: "open",
      });

      expect(result.data).toBeDefined();
      expect(result.data.every((pr) => pr.state === "open")).toBe(true);
    });

    it("should get a specific pull request", async () => {
      const result = await gh.pulls.get({
        owner: "octocat",
        repo: "Hello-World",
        pull_number: 101,
      });

      expect(result.data).toBeDefined();
      expect(result.data.number).toBe(101);
      expect(result.data.title).toBeDefined();
    });

    it("should create a pull request", async () => {
      const result = await gh.pulls.create({
        owner: "octocat",
        repo: "Hello-World",
        title: "Test PR",
        body: "Test PR body",
        head: "test-user:feature-branch",
        base: "main",
      });

      expect(result.data).toBeDefined();
      expect(result.data.title).toBe("Test PR");
      expect(result.data.number).toBe(999);
    });

    it("should update a pull request", async () => {
      const result = await gh.pulls.update({
        owner: "octocat",
        repo: "Hello-World",
        pull_number: 101,
        title: "Updated PR Title",
        body: "Updated PR body",
      });

      expect(result.data).toBeDefined();
      expect(result.data.title).toBe("Updated PR Title");
    });

    it("should request reviewers", async () => {
      const result = await gh.pulls.requestReviewers({
        owner: "octocat",
        repo: "Hello-World",
        pull_number: 101,
        reviewers: ["reviewer1", "reviewer2"],
      });

      expect(result.data).toBeDefined();
      expect(result.data.requested_reviewers).toBeDefined();
    });

    it("should list review comments", async () => {
      const result = await gh.pulls.listReviewComments({
        owner: "octocat",
        repo: "Hello-World",
        pull_number: 101,
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe("Issues API", () => {
    it("should list issues", async () => {
      const result = await gh.issues.listForRepo({
        owner: "octocat",
        repo: "Hello-World",
        state: "open",
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should filter issues by labels", async () => {
      const result = await gh.issues.listForRepo({
        owner: "octocat",
        repo: "Hello-World",
        labels: "bug",
      });

      expect(result.data).toBeDefined();
      expect(
        result.data.every((issue) =>
          issue.labels.some((l) => (typeof l === "string" ? l === "bug" : l.name === "bug")),
        ),
      ).toBe(true);
    });

    it("should get a specific issue", async () => {
      const result = await gh.issues.get({
        owner: "octocat",
        repo: "Hello-World",
        issue_number: 50,
      });

      expect(result.data).toBeDefined();
      expect(result.data.number).toBe(50);
    });

    it("should update an issue", async () => {
      const result = await gh.issues.update({
        owner: "octocat",
        repo: "Hello-World",
        issue_number: 50,
        body: "Updated issue body",
      });

      expect(result.data).toBeDefined();
      expect(result.data.body).toBe("Updated issue body");
    });

    it("should list issue comments", async () => {
      const result = await gh.issues.listComments({
        owner: "octocat",
        repo: "Hello-World",
        issue_number: 50,
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should create an issue comment", async () => {
      const result = await gh.issues.createComment({
        owner: "octocat",
        repo: "Hello-World",
        issue_number: 50,
        body: "Test comment",
      });

      expect(result.data).toBeDefined();
      expect(result.data.body).toBe("Test comment");
    });

    it("should update a comment", async () => {
      const result = await gh.issues.updateComment({
        owner: "octocat",
        repo: "Hello-World",
        comment_id: 1,
        body: "Updated comment",
      });

      expect(result.data).toBeDefined();
      expect(result.data.body).toBe("Updated comment");
    });

    it("should get a comment", async () => {
      const result = await gh.issues.getComment({
        owner: "octocat",
        repo: "Hello-World",
        comment_id: 1,
      });

      expect(result.data).toBeDefined();
      expect(result.data.body).toBeDefined();
    });

    it("should add labels to an issue", async () => {
      const result = await gh.issues.addLabels({
        owner: "octocat",
        repo: "Hello-World",
        issue_number: 50,
        labels: ["bug", "enhancement"],
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should list timeline events", async () => {
      const result = await gh.issues.listEventsForTimeline({
        owner: "octocat",
        repo: "Hello-World",
        issue_number: 50,
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe("Git API", () => {
    it("should get an annotated tag", async () => {
      const result = await gh.git.getTag({
        owner: "comfyanonymous",
        repo: "ComfyUI",
        tag_sha: "abc123",
      });

      expect(result.data).toBeDefined();
      expect(result.data.tag).toBeDefined();
      expect(result.data.tagger).toBeDefined();
      expect(result.data.message).toBeDefined();
    });

    it("should handle non-annotated tag errors gracefully", async () => {
      // Mock a 404 response for lightweight tags
      server.use(
        http.get("https://api.github.com/repos/:owner/:repo/git/tags/:tag_sha", () => {
          return new HttpResponse(null, {
            status: 404,
            statusText: "Not Found",
          });
        }),
      );

      try {
        await gh.git.getTag({
          owner: "comfyanonymous",
          repo: "ComfyUI",
          tag_sha: "lightweight-tag",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.status).toBe(404);
      }
    });
  });

  describe("Users API", () => {
    it("should get authenticated user", async () => {
      const result = await gh.users.getAuthenticated();

      expect(result.data).toBeDefined();
      expect(result.data.login).toBe("test-authenticated-user");
      expect(result.data.email).toBeDefined();
    });

    it("should get a user by username", async () => {
      const result = await gh.users.getByUsername({
        username: "octocat",
      });

      expect(result.data).toBeDefined();
      expect(result.data.login).toBe("octocat");
    });
  });

  describe("Error Handling", () => {
    it("should handle 404 errors", async () => {
      server.use(
        http.get("https://api.github.com/repos/:owner/:repo", () => {
          return new HttpResponse(
            JSON.stringify({
              message: "Not Found",
              documentation_url: "https://docs.github.com/rest",
            }),
            {
              status: 404,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }),
      );

      try {
        await gh.repos.get({
          owner: "nonexistent",
          repo: "nonexistent",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.status).toBe(404);
      }
    });

    it("should handle rate limit errors", async () => {
      server.use(
        http.get("https://api.github.com/repos/:owner/:repo", () => {
          return new HttpResponse(
            JSON.stringify({
              message: "API rate limit exceeded",
              documentation_url:
                "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting",
            }),
            {
              status: 403,
              headers: {
                "Content-Type": "application/json",
                "X-RateLimit-Limit": "60",
                "X-RateLimit-Remaining": "0",
              },
            },
          );
        }),
      );

      try {
        await gh.repos.get({
          owner: "octocat",
          repo: "Hello-World",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
    });
  });
});

describe("GitHub Cached Client (ghc)", () => {
  beforeEach(async () => {
    await clearGhCache();
  });

  it("should cache API responses", async () => {
    // First call - should hit the API
    const result1 = await ghc.repos.get({
      owner: "octocat",
      repo: "Hello-World",
    });

    expect(result1.data).toBeDefined();
    expect(result1.data.name).toBe("Hello-World");

    // Modify the mock to return different data
    server.use(
      http.get("https://api.github.com/repos/:owner/:repo", () => {
        return HttpResponse.json({
          id: 999999,
          name: "Modified-Repo",
          full_name: "octocat/Modified-Repo",
          owner: {
            login: "octocat",
            id: 1,
          },
          default_branch: "main",
        });
      }),
    );

    // Second call - should use cache and return original data
    const result2 = await ghc.repos.get({
      owner: "octocat",
      repo: "Hello-World",
    });

    // Should still have the original cached data
    expect(result2.data.name).toBe("Hello-World");
    expect(result2.data.id).toBe(123456);
  });

  it("should cache different parameters separately", async () => {
    const result1 = await ghc.repos.get({
      owner: "octocat",
      repo: "Hello-World",
    });

    const result2 = await ghc.repos.get({
      owner: "octocat",
      repo: "Spoon-Knife",
    });

    expect(result1.data.name).toBe("Hello-World");
    expect(result2.data.name).toBe("Spoon-Knife");
  });

  it("should clear cache when requested", async () => {
    // First call - populate cache
    const result1 = await ghc.repos.get({
      owner: "octocat",
      repo: "Hello-World",
    });
    expect(result1.data.name).toBe("Hello-World");

    // Modify the mock
    server.use(
      http.get("https://api.github.com/repos/:owner/:repo", () => {
        return HttpResponse.json({
          id: 999999,
          name: "Modified-Repo",
          full_name: "octocat/Modified-Repo",
          owner: {
            login: "octocat",
            id: 1,
          },
          default_branch: "main",
        });
      }),
    );

    // Clear cache
    await clearGhCache();

    // Third call - should hit the API and get new data
    const result3 = await ghc.repos.get({
      owner: "octocat",
      repo: "Hello-World",
    });

    expect(result3.data.name).toBe("Modified-Repo");
  });

  it("should handle concurrent requests efficiently", async () => {
    const promises = Array(10)
      .fill(null)
      .map(() =>
        ghc.repos.get({
          owner: "octocat",
          repo: "Hello-World",
        }),
      );

    const results = await Promise.all(promises);

    // All results should be identical
    expect(results.every((r) => r.data.name === "Hello-World")).toBe(true);
    expect(results.every((r) => r.data.id === 123456)).toBe(true);
  });
});
