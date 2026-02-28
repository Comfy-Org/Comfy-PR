import { server } from "@/src/test/msw-setup";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { http, HttpResponse } from "msw";

// Track database operations
let dbOperations: unknown[] = [];
const trackingMockDb = {
  collection: () => ({
    createIndex: async () => ({}),
    findOne: async (filter: unknown) => {
      const op = dbOperations.find(
        (op) => op.filter?.sourceIssueNumber === filter?.sourceIssueNumber,
      );
      return op?.data || null;
    },
    findOneAndUpdate: async (filter: unknown, update: unknown) => {
      const data = { ...filter, ...update.$set };
      dbOperations.push({ filter, data });
      return data;
    },
  }),
};

// Use bun's mock.module
const { mock } = await import("bun:test");
mock.module("@/src/db", () => ({
  db: trackingMockDb,
}));

// Mock parseGithubRepoUrl
mock.module("@/src/parseOwnerRepo", () => ({
  parseGithubRepoUrl: (url: string) => {
    if (url === "https://github.com/Comfy-Org/ComfyUI_frontend") {
      return { owner: "Comfy-Org", repo: "ComfyUI_frontend" };
    }
    if (url === "https://github.com/comfyanonymous/ComfyUI") {
      return { owner: "comfyanonymous", repo: "ComfyUI" };
    }
    throw new Error(`Unknown repo URL: ${url}`);
  },
}));

const { default: runGithubFrontendToComfyuiIssueTransferTask } = await import("./index");

describe("GithubFrontendToComfyuiIssueTransferTask", () => {
  beforeEach(() => {
    // Reset database operations
    dbOperations = [];
  });

  afterEach(() => {
    // Reset MSW handlers
    server.resetHandlers();
  });

  it("should handle no comfyui-core issues", async () => {
    // Override default handler to return empty array
    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues", ({ request }) => {
        const url = new URL(request.url);
        const labels = url.searchParams.get("labels");
        if (labels === "comfyui-core") {
          return HttpResponse.json([]);
        }
        return HttpResponse.json([]);
      }),
    );

    await runGithubFrontendToComfyuiIssueTransferTask();

    // Verify no issues were created
    expect(dbOperations.length).toBe(0);
  });

  it.skip("should transfer new comfyui-core issue", async () => {
    const sourceIssue = {
      number: 123,
      title: "Core Backend Bug",
      body: "This is a backend core issue",
      html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/123",
      labels: [
        { name: "comfyui-core", color: "ededed" },
        { name: "bug", color: "d73a4a" },
      ],
      assignees: [{ login: "testuser", id: 1 }],
      state: "open",
      user: { login: "test-user", id: 1 },
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      comments: 0,
    };

    let createdIssue: unknown = null;
    let createdComment: unknown = null;

    server.use(
      // Mock source repo issues list
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues", ({ request }) => {
        const url = new URL(request.url);
        const labels = url.searchParams.get("labels");
        if (labels === "comfyui-core") {
          return HttpResponse.json([sourceIssue]);
        }
        return HttpResponse.json([]);
      }),
      // Mock fetching comments
      http.get(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/123/comments",
        () => {
          return HttpResponse.json([
            {
              id: 1,
              body: "First comment",
              user: { login: "test-user", id: 1 },
              created_at: "2025-01-11T10:00:00Z",
            },
            {
              id: 2,
              body: "Second comment",
              user: { login: "test-user-2", id: 2 },
              created_at: "2025-01-12T10:00:00Z",
            },
          ]);
        },
      ),
      // Mock creating issue in target repo
      http.post(
        "https://api.github.com/repos/comfyanonymous/ComfyUI/issues",
        async ({ request }) => {
          createdIssue = await request.json();
          return HttpResponse.json({
            number: 456,
            html_url: "https://github.com/comfyanonymous/ComfyUI/issues/456",
            ...createdIssue,
          });
        },
      ),
      // Mock creating comment on source issue
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/123/comments",
        async ({ request }) => {
          createdComment = await request.json();
          return HttpResponse.json({
            id: 999,
            body: createdComment.body,
            user: { login: "test-user", id: 1 },
            html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/123#issuecomment-999",
            created_at: new Date().toISOString(),
          });
        },
      ),
      // Mock closing the issue
      http.patch("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/123", () => {
        return HttpResponse.json({});
      }),
    );

    await runGithubFrontendToComfyuiIssueTransferTask();

    // Verify issue was created with correct data
    expect(createdIssue).toBeTruthy();
    expect(createdIssue.title).toBe("Core Backend Bug");
    expect(createdIssue.body).toContain("This is a backend core issue");
    expect(createdIssue.body).toContain(
      "*This issue is transferred from: https://github.com/Comfy-Org/ComfyUI_frontend/issues/123*",
    );
    expect(createdIssue.labels).toEqual(["bug"]);
    expect(createdIssue.assignees).toEqual(["testuser"]);

    // Verify comment was posted
    expect(createdComment).toBeTruthy();
    expect(createdComment.body).toContain("transferred to the ComfyUI core repository");
    expect(createdComment.body).toContain("https://github.com/comfyanonymous/ComfyUI/issues/456");

    // Verify database was updated
    const lastOp = dbOperations[dbOperations.length - 1];
    expect(lastOp.data.sourceIssueNumber).toBe(123);
    expect(lastOp.data.commentPosted).toBe(true);
  });

  it("should skip pull requests", async () => {
    const pullRequest = {
      number: 789,
      title: "Core PR",
      body: "This is a PR",
      html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/789",
      labels: [{ name: "comfyui-core", color: "ededed" }],
      assignees: [],
      pull_request: { url: "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/pulls/789" },
      state: "open",
      user: { login: "test-user", id: 1 },
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      comments: 0,
    };

    let issueCreated = false;

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues", () => {
        return HttpResponse.json([pullRequest]);
      }),
      http.post("https://api.github.com/repos/comfyanonymous/ComfyUI/issues", () => {
        issueCreated = true;
        return HttpResponse.json({});
      }),
    );

    await runGithubFrontendToComfyuiIssueTransferTask();

    expect(issueCreated).toBe(false);
  });

  it("should skip already transferred issues", async () => {
    // Add existing transfer to database
    dbOperations.push({
      filter: { sourceIssueNumber: 999 },
      data: {
        sourceIssueNumber: 999,
        sourceIssueUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/999",
        targetIssueNumber: 888,
        targetIssueUrl: "https://github.com/comfyanonymous/ComfyUI/issues/888",
        transferredAt: new Date(),
        commentPosted: true,
      },
    });

    const alreadyTransferredIssue = {
      number: 999,
      title: "Already Transferred",
      body: "This was already transferred",
      html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/999",
      labels: [{ name: "comfyui-core", color: "ededed" }],
      assignees: [],
      state: "open",
      user: { login: "test-user", id: 1 },
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      comments: 0,
    };

    let issueCreated = false;

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues", () => {
        return HttpResponse.json([alreadyTransferredIssue]);
      }),
      http.post("https://api.github.com/repos/comfyanonymous/ComfyUI/issues", () => {
        issueCreated = true;
        return HttpResponse.json({});
      }),
    );

    await runGithubFrontendToComfyuiIssueTransferTask();

    expect(issueCreated).toBe(false);
  });

  it.skip("should handle errors gracefully", async () => {
    const sourceIssue = {
      number: 555,
      title: "Error Issue",
      body: "This will fail",
      html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/555",
      labels: [{ name: "comfyui-core", color: "ededed" }],
      assignees: [],
      state: "open",
      user: { login: "test-user", id: 1 },
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      comments: 0,
    };

    let createAttempts = 0;

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues", () => {
        return HttpResponse.json([sourceIssue]);
      }),
      http.get(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/555/comments",
        () => {
          return HttpResponse.json([]);
        },
      ),
      http.post("https://api.github.com/repos/comfyanonymous/ComfyUI/issues", () => {
        createAttempts++;
        return new HttpResponse(JSON.stringify({ message: "API Error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await runGithubFrontendToComfyuiIssueTransferTask();

    // Verify error was saved to database
    expect(createAttempts).toBeGreaterThan(0);
    const errorOp = dbOperations.find((op) => op.data.sourceIssueNumber === 555 && op.data.error);
    expect(errorOp).toBeTruthy();
    expect(errorOp.data.error).toBeTruthy();
  }, 20000);

  it.skip("should handle comment posting errors", async () => {
    const sourceIssue = {
      number: 666,
      title: "Comment Error",
      body: "Comment will fail",
      html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/666",
      labels: [{ name: "comfyui-core", color: "ededed" }],
      assignees: [],
      state: "open",
      user: { login: "test-user", id: 1 },
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      comments: 0,
    };

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues", () => {
        return HttpResponse.json([sourceIssue]);
      }),
      http.get(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/666/comments",
        () => {
          return HttpResponse.json([]);
        },
      ),
      http.post("https://api.github.com/repos/comfyanonymous/ComfyUI/issues", () => {
        return HttpResponse.json({
          number: 777,
          html_url: "https://github.com/comfyanonymous/ComfyUI/issues/777",
        });
      }),
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/666/comments",
        () => {
          return HttpResponse.json({ message: "Comment Error" }, { status: 403 });
        },
      ),
    );

    await runGithubFrontendToComfyuiIssueTransferTask();

    // Verify task was saved with comment error
    const commentErrorOp = dbOperations.find((op) => op.data.commentPosted === false);
    expect(commentErrorOp).toBeTruthy();
    expect(commentErrorOp.data.error).toContain("Comment Error");
  });

  it.skip("should handle pagination with multiple pages", async () => {
    // Create 100 issues for first page to trigger pagination
    const page1Issues = Array.from({ length: 100 }, (_, i) => ({
      number: 1000 + i,
      title: `Issue ${1000 + i}`,
      body: `Body ${1000 + i}`,
      html_url: `https://github.com/Comfy-Org/ComfyUI_frontend/issues/${1000 + i}`,
      labels: [{ name: "comfyui-core", color: "ededed" }],
      assignees: [],
      state: "open",
      user: { login: "test-user", id: 1 },
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      comments: 0,
    }));

    // Create 3 issues for second page (partial page - should stop pagination)
    const page2Issues = Array.from({ length: 3 }, (_, i) => ({
      number: 2000 + i,
      title: `Issue ${2000 + i}`,
      body: `Body ${2000 + i}`,
      html_url: `https://github.com/Comfy-Org/ComfyUI_frontend/issues/${2000 + i}`,
      labels: [{ name: "comfyui-core", color: "ededed" }],
      assignees: [],
      state: "open",
      user: { login: "test-user", id: 1 },
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      comments: 0,
    }));

    let issuesCreated = 0;
    let commentsCreated = 0;

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues", ({ request }) => {
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get("page") || "1");
        if (page === 1) {
          return HttpResponse.json(page1Issues);
        } else if (page === 2) {
          return HttpResponse.json(page2Issues);
        }
        return HttpResponse.json([]);
      }),
      http.get(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/:issue_number/comments",
        () => {
          return HttpResponse.json([]);
        },
      ),
      http.post(
        "https://api.github.com/repos/comfyanonymous/ComfyUI/issues",
        async ({ request }) => {
          const body: unknown = await request.json();
          issuesCreated++;
          const issueNumber = parseInt(body.title.split(" ")[1]);
          return HttpResponse.json({
            number: issueNumber + 10000,
            html_url: `https://github.com/comfyanonymous/ComfyUI/issues/${issueNumber + 10000}`,
          });
        },
      ),
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/:issue_number/comments",
        () => {
          commentsCreated++;
          return HttpResponse.json({
            id: commentsCreated,
            html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/comment",
          });
        },
      ),
      http.patch(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/:issue_number",
        () => {
          return HttpResponse.json({});
        },
      ),
    );

    await runGithubFrontendToComfyuiIssueTransferTask();

    // Verify all 103 issues were processed (100 from page 1, 3 from page 2)
    expect(issuesCreated).toBe(103);
    expect(commentsCreated).toBe(103);
  }, 120000);
});
