import { db } from "@/src/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

// Mock gh before importing the task
const mockIssues = {
  listForRepo: mock(() => Promise.resolve({ data: [] })),
  create: mock(() =>
    Promise.resolve({
      data: {
        number: 456,
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/456",
      },
    }),
  ),
  createComment: mock(() =>
    Promise.resolve({
      data: {
        html_url: "https://github.com/comfyanonymous/ComfyUI/issues/123#issuecomment-1",
      },
    }),
  ),
};

mock.module("@/src/gh", () => ({
  gh: {
    issues: mockIssues,
  },
}));

const { GithubFrontendIssueTransferTask, default: runGithubFrontendIssueTransferTask } = await import("./index");

describe("GithubFrontendIssueTransferTask", () => {
  beforeAll(async () => {
    // Clean up test data before running tests
    await GithubFrontendIssueTransferTask.deleteMany({});
  });

  afterAll(async () => {
    // Clean up test data after tests
    await GithubFrontendIssueTransferTask.deleteMany({});
    await db.close();
  });

  beforeEach(() => {
    // Reset mocks before each test
    mockIssues.listForRepo.mockClear();
    mockIssues.create.mockClear();
    mockIssues.createComment.mockClear();
  });

  it("should handle no frontend issues", async () => {
    mockIssues.listForRepo.mockResolvedValueOnce({
      data: [],
    });

    await runGithubFrontendIssueTransferTask();

    expect(mockIssues.listForRepo).toHaveBeenCalledWith({
      owner: "comfyanonymous",
      repo: "ComfyUI",
      labels: "frontend",
      state: "open",
      per_page: 100,
    });
    expect(mockIssues.create).not.toHaveBeenCalled();
  });

  it("should transfer new frontend issue", async () => {
    const sourceIssue = {
      number: 123,
      title: "Frontend Bug",
      body: "This is a frontend issue",
      html_url: "https://github.com/comfyanonymous/ComfyUI/issues/123",
      labels: [{ name: "frontend" }, { name: "bug" }],
      assignees: [{ login: "testuser" }],
    };

    mockIssues.listForRepo.mockResolvedValueOnce({
      data: [sourceIssue],
    });

    mockIssues.create.mockResolvedValueOnce({
      data: {
        number: 456,
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/456",
      },
    });

    mockIssues.createComment.mockResolvedValueOnce({
      data: {
        html_url: "https://github.com/comfyanonymous/ComfyUI/issues/123#issuecomment-1",
      },
    });

    await runGithubFrontendIssueTransferTask();

    // Verify issue was created
    expect(mockIssues.create).toHaveBeenCalledWith({
      owner: "Comfy-Org",
      repo: "ComfyUI_frontend",
      title: "Frontend Bug",
      body: "This is a frontend issue\n\n---\n\n*Transferred from: https://github.com/comfyanonymous/ComfyUI/issues/123*",
      labels: ["frontend", "bug"],
      assignees: ["testuser"],
    });

    // Verify comment was posted
    expect(mockIssues.createComment).toHaveBeenCalledWith({
      owner: "comfyanonymous",
      repo: "ComfyUI",
      issue_number: 123,
      body: "This issue has been transferred to the frontend repository: https://github.com/Comfy-Org/ComfyUI_frontend/issues/456\n\nPlease continue the discussion there.",
    });

    // Verify task was saved to database
    const savedTask = await GithubFrontendIssueTransferTask.findOne({ sourceIssueNumber: 123 });
    expect(savedTask).toBeTruthy();
    expect(savedTask?.targetIssueNumber).toBe(456);
    expect(savedTask?.targetIssueUrl).toBe("https://github.com/Comfy-Org/ComfyUI_frontend/issues/456");
    expect(savedTask?.commentPosted).toBe(true);
  });

  it("should skip pull requests", async () => {
    const pullRequest = {
      number: 789,
      title: "Frontend PR",
      body: "This is a PR",
      html_url: "https://github.com/comfyanonymous/ComfyUI/pull/789",
      labels: [{ name: "frontend" }],
      assignees: [],
      pull_request: { url: "https://api.github.com/repos/comfyanonymous/ComfyUI/pulls/789" },
    };

    mockIssues.listForRepo.mockResolvedValueOnce({
      data: [pullRequest],
    });

    await runGithubFrontendIssueTransferTask();

    expect(mockIssues.create).not.toHaveBeenCalled();
    expect(mockIssues.createComment).not.toHaveBeenCalled();
  });

  it("should skip already transferred issues", async () => {
    // Create an already-transferred task
    await GithubFrontendIssueTransferTask.insertOne({
      sourceIssueNumber: 999,
      sourceIssueUrl: "https://github.com/comfyanonymous/ComfyUI/issues/999",
      targetIssueNumber: 888,
      targetIssueUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/888",
      transferredAt: new Date(),
      commentPosted: true,
    });

    const alreadyTransferredIssue = {
      number: 999,
      title: "Already Transferred",
      body: "This was already transferred",
      html_url: "https://github.com/comfyanonymous/ComfyUI/issues/999",
      labels: [{ name: "frontend" }],
      assignees: [],
    };

    mockIssues.listForRepo.mockResolvedValueOnce({
      data: [alreadyTransferredIssue],
    });

    await runGithubFrontendIssueTransferTask();

    expect(mockIssues.create).not.toHaveBeenCalled();
    expect(mockIssues.createComment).not.toHaveBeenCalled();
  });

  it("should handle errors gracefully", async () => {
    const sourceIssue = {
      number: 555,
      title: "Error Issue",
      body: "This will fail",
      html_url: "https://github.com/comfyanonymous/ComfyUI/issues/555",
      labels: [{ name: "frontend" }],
      assignees: [],
    };

    mockIssues.listForRepo.mockResolvedValueOnce({
      data: [sourceIssue],
    });

    mockIssues.create.mockRejectedValueOnce(new Error("API Error"));

    await runGithubFrontendIssueTransferTask();

    // Verify error was saved to database
    const savedTask = await GithubFrontendIssueTransferTask.findOne({ sourceIssueNumber: 555 });
    expect(savedTask).toBeTruthy();
    expect(savedTask?.error).toContain("API Error");
    expect(savedTask?.targetIssueUrl).toBeUndefined();
  });

  it("should handle comment posting errors", async () => {
    const sourceIssue = {
      number: 666,
      title: "Comment Error",
      body: "Comment will fail",
      html_url: "https://github.com/comfyanonymous/ComfyUI/issues/666",
      labels: [{ name: "frontend" }],
      assignees: [],
    };

    mockIssues.listForRepo.mockResolvedValueOnce({
      data: [sourceIssue],
    });

    mockIssues.create.mockResolvedValueOnce({
      data: {
        number: 777,
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/777",
      },
    });

    mockIssues.createComment.mockRejectedValueOnce(new Error("Comment Error"));

    await runGithubFrontendIssueTransferTask();

    // Verify task was saved with comment error
    const savedTask = await GithubFrontendIssueTransferTask.findOne({ sourceIssueNumber: 666 });
    expect(savedTask).toBeTruthy();
    expect(savedTask?.targetIssueUrl).toBe("https://github.com/Comfy-Org/ComfyUI_frontend/issues/777");
    expect(savedTask?.commentPosted).toBe(false);
    expect(savedTask?.error).toContain("Comment Error");
  });
});
