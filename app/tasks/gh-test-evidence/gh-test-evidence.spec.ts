#!/usr/bin/env bun test
import { server } from "@/src/test/msw-setup";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { http, HttpResponse } from "msw";

// Mock database operations
let mockTasks: any = {};
const mockCollection = {
  findOneAndUpdate: mock(async (filter: any, update: any, options: any) => {
    const key = filter.prUrl;
    if (options?.upsert) {
      mockTasks[key] = { ...mockTasks[key], ...update.$set };
      return mockTasks[key];
    }
    return mockTasks[key];
  }),
};

const mockDb = {
  collection: mock(() => mockCollection),
  close: mock(() => Promise.resolve()),
};

mock.module("@/src/db", () => ({ db: mockDb }));

// Mock GitHub client
const mockGhc = {
  pulls: {
    list: mock(() => Promise.resolve({ data: [] })),
  },
  issues: {
    listComments: mock(() => Promise.resolve({ data: [] })),
  },
};

const mockGh = {
  issues: {
    createComment: mock(() => Promise.resolve({ data: { id: 123 } })),
    updateComment: mock(() => Promise.resolve({ data: { id: 123 } })),
    deleteComment: mock(() => Promise.resolve()),
  },
};

mock.module("@/src/ghc", () => ({ ghc: mockGhc }));
mock.module("@/src/gh", () => ({ gh: mockGh }));
mock.module("@/src/ghUser", () => ({ ghUser: mock(() => Promise.resolve({ login: "test-bot" })) }));

describe("gh-test-evidence", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockTasks = {};
    mockDb.collection.mockClear();
    mockCollection.findOneAndUpdate.mockClear();
    mockGhc.pulls.list.mockClear();
    mockGhc.issues.listComments.mockClear();
    mockGh.issues.createComment.mockClear();
    mockGh.issues.updateComment.mockClear();
    mockGh.issues.deleteComment.mockClear();

    // Setup default pulls.list to return empty for ComfyUI repo
    // This prevents duplicate processing in tests
    mockGhc.pulls.list.mockImplementation(async (params: any) => {
      if (params.owner === "comfyanonymous" && params.repo === "ComfyUI") {
        return { data: [] };
      }
      return { data: [] };
    });

    // Setup default OpenAI handler
    server.use(
      http.post("https://api.openai.com/v1/chat/completions", () => {
        return HttpResponse.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  isTestExplanationIncluded: false,
                  isTestScreenshotIncluded: false,
                  isTestVideoIncluded: false,
                }),
              },
            },
          ],
        });
      }),
    );
  });

  it("should analyze PR with missing test evidence", async () => {
    const mockPR = {
      html_url: "https://github.com/Comfy-Org/desktop/pull/1",
      number: 1,
      title: "Test PR",
      body: "Some changes",
      updated_at: new Date().toISOString(),
      draft: false,
      base: {
        repo: {
          html_url: "https://github.com/Comfy-Org/desktop",
        },
      },
    };

    // Mock pulls.list to return our test PR only for desktop repo
    mockGhc.pulls.list.mockImplementation(async (params: any) => {
      if (params.owner === "Comfy-Org" && params.repo === "desktop") {
        return { data: [mockPR] };
      }
      return { data: [] };
    });

    // Mock issues.listComments to return no existing comments
    mockGhc.issues.listComments.mockResolvedValue({ data: [] });

    // Mock createComment to return a comment ID
    mockGh.issues.createComment.mockResolvedValue({ data: { id: 456 } });

    // Import and run the task
    const runGhTestEvidenceTask = (await import("./gh-test-evidence")).default;
    await runGhTestEvidenceTask();

    // Verify that a comment was created
    expect(mockGh.issues.createComment).toHaveBeenCalledTimes(1);
    const createCall = mockGh.issues.createComment.mock.calls[0][0];
    expect(createCall.owner).toBe("Comfy-Org");
    expect(createCall.repo).toBe("desktop");
    expect(createCall.issue_number).toBe(1);
    expect(createCall.body).toContain("<!-- COMFY_PR_BOT_TEST_EVIDENCE -->");
    expect(createCall.body).toContain("Test Evidence Check");
    expect(createCall.body).toContain("Test Explanation Missing");
  });

  it("should skip draft PRs", async () => {
    const mockPR = {
      html_url: "https://github.com/Comfy-Org/desktop/pull/2",
      number: 2,
      title: "Draft PR",
      body: "Draft changes",
      updated_at: new Date().toISOString(),
      draft: true,
      base: {
        repo: {
          html_url: "https://github.com/Comfy-Org/desktop",
        },
      },
    };

    // Mock pulls.list to return a draft PR only for desktop repo
    mockGhc.pulls.list.mockImplementation(async (params: any) => {
      if (params.owner === "Comfy-Org" && params.repo === "desktop") {
        return { data: [mockPR] };
      }
      return { data: [] };
    });

    // Import and run the task
    const runGhTestEvidenceTask = (await import("./gh-test-evidence")).default;
    await runGhTestEvidenceTask();

    // Verify that no comments were created for draft PRs
    expect(mockGh.issues.createComment).not.toHaveBeenCalled();
    expect(mockGh.issues.updateComment).not.toHaveBeenCalled();
    expect(mockGh.issues.deleteComment).not.toHaveBeenCalled();

    // Verify that OpenAI was not called (no requests to the mock server)
    // Draft PRs should be skipped entirely without analysis
  });

  it("should delete comment when all evidence is present", async () => {
    const mockPR = {
      html_url: "https://github.com/Comfy-Org/desktop/pull/3",
      number: 3,
      title: "Complete PR",
      body: "Here's my test plan. And here's a screenshot: ![image](https://example.com/img.png). Here's a video: https://youtube.com/watch?v=test",
      updated_at: new Date().toISOString(),
      draft: false,
      base: {
        repo: {
          html_url: "https://github.com/Comfy-Org/desktop",
        },
      },
    };

    const existingComment = {
      id: 456,
      user: { login: "test-bot" },
      body: "<!-- COMFY_PR_BOT_TEST_EVIDENCE -->\nWarning message",
    };

    // Mock pulls.list to return a PR with all evidence only for desktop repo
    mockGhc.pulls.list.mockImplementation(async (params: any) => {
      if (params.owner === "Comfy-Org" && params.repo === "desktop") {
        return { data: [mockPR] };
      }
      return { data: [] };
    });

    // Mock issues.listComments to return an existing bot comment
    mockGhc.issues.listComments.mockResolvedValue({ data: [existingComment] });

    // Override OpenAI response for this test to indicate all evidence is present
    server.use(
      http.post("https://api.openai.com/v1/chat/completions", () => {
        return HttpResponse.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  isTestExplanationIncluded: true,
                  isTestScreenshotIncluded: true,
                  isTestVideoIncluded: true,
                }),
              },
            },
          ],
        });
      }),
    );

    // Import and run the task
    const runGhTestEvidenceTask = (await import("./gh-test-evidence")).default;
    await runGhTestEvidenceTask();

    // Verify that the existing comment was deleted
    expect(mockGh.issues.deleteComment).toHaveBeenCalledTimes(1);
    const deleteCall = mockGh.issues.deleteComment.mock.calls[0][0];
    expect(deleteCall.owner).toBe("Comfy-Org");
    expect(deleteCall.repo).toBe("desktop");
    expect(deleteCall.issue_number).toBe(3);
    expect(deleteCall.comment_id).toBe(456);

    // Verify that no new comments were created
    expect(mockGh.issues.createComment).not.toHaveBeenCalled();
  });

  it("should generate correct warning message format", async () => {
    const mockPR = {
      html_url: "https://github.com/Comfy-Org/desktop/pull/4",
      number: 4,
      title: "Test PR",
      body: "No test evidence",
      updated_at: new Date().toISOString(),
      draft: false,
      base: {
        repo: {
          html_url: "https://github.com/Comfy-Org/desktop",
        },
      },
    };

    // Mock pulls.list to return a PR with missing evidence only for desktop repo
    mockGhc.pulls.list.mockImplementation(async (params: any) => {
      if (params.owner === "Comfy-Org" && params.repo === "desktop") {
        return { data: [mockPR] };
      }
      return { data: [] };
    });

    // Mock issues.listComments to return no existing comments
    mockGhc.issues.listComments.mockResolvedValue({ data: [] });

    // Mock createComment to capture the warning message
    mockGh.issues.createComment.mockResolvedValue({ data: { id: 789 } });

    // Import and run the task
    const runGhTestEvidenceTask = (await import("./gh-test-evidence")).default;
    await runGhTestEvidenceTask();

    // Get the created comment body
    const createCall = mockGh.issues.createComment.mock.calls[0][0];
    const warningMessage = createCall.body;

    // Verify warning message format
    expect(warningMessage).toContain("<!-- COMFY_PR_BOT_TEST_EVIDENCE -->");
    expect(warningMessage).toContain("## Test Evidence Check");
    expect(warningMessage).toContain("⚠️");
    expect(warningMessage).toContain("**Warning: Test Explanation Missing**");
    expect(warningMessage).toContain("**Warning: Visual Documentation Missing**");
    expect(warningMessage).toContain("screen recording or screenshot");
    expect(warningMessage).toContain("GitHub: Drag & drop");
    expect(warningMessage).toContain("YouTube:");
  });
});
