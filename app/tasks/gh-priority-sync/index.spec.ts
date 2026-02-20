import { server } from "@/src/test/msw-setup";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { http, HttpResponse } from "msw";

// Track database operations
let dbOperations: Map<string, unknown> = new Map();
const mockMongoCollection = {
  createIndex: async () => ({}),
  findOne: async (filter: unknown) => {
    const key = JSON.stringify(filter);
    return dbOperations.get(key) || null;
  },
  updateOne: async (filter: unknown, update: unknown, _options?: unknown) => {
    const key = JSON.stringify(filter);
    const data = { ...filter, ...update.$set };
    dbOperations.set(key, data);
    return { modifiedCount: 1 };
  },
};

const trackingMockDb = {
  collection: () => mockMongoCollection,
};

// Use bun's mock.module
const { mock } = await import("bun:test");
mock.module("@/src/db", () => ({
  db: trackingMockDb,
}));

// Mock parseIssueUrl
mock.module("@/src/parseIssueUrl", () => ({
  parseIssueUrl: (url: string) => {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/);
    if (!match) throw new Error(`Invalid issue URL: ${url}`);
    return {
      owner: match[1],
      repo: match[2],
      issue_number: parseInt(match[3]),
    };
  },
}));

// Mock Notion client
let mockNotionPages: unknown[] = [];
let mockNotionDatabase: unknown = null;
const mockNotionClient = {
  databases: {
    retrieve: async ({ database_id }: unknown) => {
      return (
        mockNotionDatabase || {
          id: database_id,
          data_sources: [{ id: "test-data-source-id" }],
        }
      );
    },
  },
  dataSources: {
    query: async ({ data_source_id: _data_source_id, start_cursor, page_size = 100 }: unknown) => {
      let results = mockNotionPages;

      // If there's a start_cursor (page ID), find that page and return everything after it
      if (start_cursor) {
        const cursorIndex = mockNotionPages.findIndex((p) => p.id === start_cursor);
        if (cursorIndex >= 0) {
          results = mockNotionPages.slice(cursorIndex);
        }
      }

      // Apply page_size limit
      const pagedResults = results.slice(0, page_size);
      const hasMore = results.length > page_size;
      const nextCursor = hasMore ? results[page_size].id : null;

      return {
        results: pagedResults,
        next_cursor: nextCursor,
        has_more: hasMore,
      };
    },
  },
};

mock.module("@notionhq/client", () => ({
  default: {
    Client: class {
      constructor() {
        return mockNotionClient;
      }
    },
  },
}));

// Mock keyv-cache-proxy to bypass caching during tests
mock.module("keyv-cache-proxy", () => ({
  default: () => (target: unknown) => target,
  globalThisCached: (_name: string, factory: () => unknown) => factory(),
}));

// Mock Keyv to use in-memory storage
const keyvStorage = new Map();
mock.module("keyv", () => ({
  default: class Keyv {
    async get(key: string) {
      return keyvStorage.get(key);
    }
    async set(key: string, value: unknown) {
      keyvStorage.set(key, value);
      return true;
    }
    async delete(key: string) {
      keyvStorage.delete(key);
      return true;
    }
  },
}));

// Mock KeyvNest to pass through
mock.module("keyv-nest", () => ({
  default: (...stores: unknown[]) => stores[stores.length - 1],
}));

// Set environment variables
process.env.GH_TOKEN_COMFY_PR_BOT = "test-token";
process.env.NOTION_TOKEN = "test-notion-token";

const { default: GithubIssuePrioritiesLabler } = await import("./index");

describe("GithubIssuePrioritiesLabeler", () => {
  beforeEach(() => {
    // Reset database operations
    dbOperations = new Map();

    // Reset Keyv storage
    keyvStorage.clear();

    // Reset Notion mock data
    mockNotionPages = [];
    mockNotionDatabase = {
      id: "test-db-id",
      data_sources: [{ id: "test-data-source-id" }],
    };
  });

  afterEach(() => {
    // Reset MSW handlers
    server.resetHandlers();
  });

  it("should handle no tasks with priority labels", async () => {
    mockNotionPages = [];

    await GithubIssuePrioritiesLabler();

    // Verify no GitHub API calls were made for labels
    expect(dbOperations.size).toBe(0);
  });

  it("should add missing priority label to issue", async () => {
    const notionPage = {
      id: "page-123",
      last_edited_time: "2025-01-10T10:00:00Z",
      properties: {
        Task: {
          title: [{ plain_text: "Fix bug in frontend" }],
        },
        Priority: {
          select: { name: "High" },
        },
        "[GH🤖] Link": {
          url: "https://github.com/Comfy-Org/ComfyUI_frontend/issues/100",
        },
      },
    };

    mockNotionPages = [notionPage];

    let labelsAdded: string[] = [];

    server.use(
      // Mock getting existing labels
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/100/labels", () => {
        return HttpResponse.json([
          { name: "bug", color: "d73a4a" },
          { name: "frontend", color: "ededed" },
        ]);
      }),
      // Mock adding labels
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/100/labels",
        async ({ request }) => {
          const body: unknown = await request.json();
          labelsAdded = body.labels || [];
          return HttpResponse.json(labelsAdded.map((name) => ({ name, color: "000000" })));
        },
      ),
    );

    await GithubIssuePrioritiesLabler();

    // Verify High-Priority label was added
    expect(labelsAdded).toEqual(["High-Priority"]);

    // Verify checkpoint was saved
    const checkpoint = keyvStorage.get("checkpoint");
    expect(checkpoint).toBeTruthy();
    expect(checkpoint.id).toBe("page-123");
  });

  it("should remove obsolete priority label", async () => {
    const notionPage = {
      id: "page-456",
      last_edited_time: "2025-01-10T10:00:00Z",
      properties: {
        Task: {
          title: [{ plain_text: "Update documentation" }],
        },
        Priority: {
          select: { name: "Low" },
        },
        "[GH🤖] Link": {
          url: "https://github.com/Comfy-Org/ComfyUI/issues/200",
        },
      },
    };

    mockNotionPages = [notionPage];

    let labelsRemoved: string[] = [];
    let labelsAdded: string[] = [];

    server.use(
      // Mock getting existing labels (has High-Priority but should be Low-Priority)
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/200/labels", () => {
        return HttpResponse.json([
          { name: "documentation", color: "0075ca" },
          { name: "High-Priority", color: "d73a4a" },
        ]);
      }),
      // Mock removing label
      http.delete(
        "https://api.github.com/repos/Comfy-Org/ComfyUI/issues/200/labels/:name",
        ({ params }) => {
          labelsRemoved.push(params.name as string);
          return HttpResponse.json({});
        },
      ),
      // Mock adding labels
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI/issues/200/labels",
        async ({ request }) => {
          const body: unknown = await request.json();
          labelsAdded = body.labels || [];
          return HttpResponse.json(labelsAdded.map((name) => ({ name, color: "000000" })));
        },
      ),
    );

    await GithubIssuePrioritiesLabler();

    // Verify High-Priority was removed and Low-Priority was added
    expect(labelsRemoved).toContain("High-Priority");
    expect(labelsAdded).toEqual(["Low-Priority"]);
  });

  it("should skip tasks without priority", async () => {
    const notionPage = {
      id: "page-789",
      last_edited_time: "2025-01-10T10:00:00Z",
      properties: {
        Task: {
          title: [{ plain_text: "Task without priority" }],
        },
        Priority: {
          select: { name: "" }, // Empty priority
        },
        "[GH🤖] Link": {
          url: "https://github.com/Comfy-Org/ComfyUI/issues/300",
        },
      },
    };

    mockNotionPages = [notionPage];

    let githubCalled = false;

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/300/labels", () => {
        githubCalled = true;
        return HttpResponse.json([]);
      }),
    );

    await GithubIssuePrioritiesLabler();

    // Verify GitHub was not called
    expect(githubCalled).toBe(false);
  });

  it("should skip tasks without GitHub link", async () => {
    const notionPage = {
      id: "page-101",
      last_edited_time: "2025-01-10T10:00:00Z",
      properties: {
        Task: {
          title: [{ plain_text: "Task without link" }],
        },
        Priority: {
          select: { name: "Medium" },
        },
        "[GH🤖] Link": {
          url: "",
        },
      },
    };

    mockNotionPages = [notionPage];

    let githubCalled = false;

    server.use(
      http.get("https://api.github.com/repos/:owner/:repo/issues/:number/labels", () => {
        githubCalled = true;
        return HttpResponse.json([]);
      }),
    );

    await GithubIssuePrioritiesLabler();

    // Verify GitHub was not called
    expect(githubCalled).toBe(false);
  });

  it("should handle Medium priority correctly", async () => {
    const notionPage = {
      id: "page-999",
      last_edited_time: "2025-01-10T10:00:00Z",
      properties: {
        Task: {
          title: [{ plain_text: "Medium priority task" }],
        },
        Priority: {
          select: { name: "Medium" },
        },
        "[GH🤖] Link": {
          url: "https://github.com/Comfy-Org/ComfyUI/issues/400",
        },
      },
    };

    mockNotionPages = [notionPage];

    let labelsAdded: string[] = [];

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/400/labels", () => {
        return HttpResponse.json([]);
      }),
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI/issues/400/labels",
        async ({ request }) => {
          const body: unknown = await request.json();
          labelsAdded = body.labels || [];
          return HttpResponse.json(labelsAdded.map((name) => ({ name, color: "000000" })));
        },
      ),
    );

    await GithubIssuePrioritiesLabler();

    // Verify Medium-Priority label was added
    expect(labelsAdded).toEqual(["Medium-Priority"]);
  });

  it("should skip issue when labels are already correct", async () => {
    const notionPage = {
      id: "page-555",
      last_edited_time: "2025-01-10T10:00:00Z",
      properties: {
        Task: {
          title: [{ plain_text: "Already labeled correctly" }],
        },
        Priority: {
          select: { name: "High" },
        },
        "[GH🤖] Link": {
          url: "https://github.com/Comfy-Org/ComfyUI/issues/500",
        },
      },
    };

    mockNotionPages = [notionPage];

    let labelsAdded = false;
    let labelsRemoved = false;

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/500/labels", () => {
        return HttpResponse.json([
          { name: "bug", color: "d73a4a" },
          { name: "High-Priority", color: "d73a4a" },
        ]);
      }),
      http.post("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/500/labels", () => {
        labelsAdded = true;
        return HttpResponse.json([]);
      }),
      http.delete("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/500/labels/:name", () => {
        labelsRemoved = true;
        return HttpResponse.json({});
      }),
    );

    await GithubIssuePrioritiesLabler();

    // Verify no label changes were made
    expect(labelsAdded).toBe(false);
    expect(labelsRemoved).toBe(false);

    // Verify checkpoint was still saved
    const checkpoint = keyvStorage.get("checkpoint");
    expect(checkpoint).toBeTruthy();
  });

  it("should handle label removal errors gracefully", async () => {
    const notionPage = {
      id: "page-666",
      last_edited_time: "2025-01-10T10:00:00Z",
      properties: {
        Task: {
          title: [{ plain_text: "Label removal will fail" }],
        },
        Priority: {
          select: { name: "Low" },
        },
        "[GH🤖] Link": {
          url: "https://github.com/Comfy-Org/ComfyUI/issues/600",
        },
      },
    };

    mockNotionPages = [notionPage];

    let labelsAdded: string[] = [];

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/600/labels", () => {
        return HttpResponse.json([{ name: "High-Priority", color: "d73a4a" }]);
      }),
      // Mock label removal failure
      http.delete("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/600/labels/:name", () => {
        return HttpResponse.json({ message: "Label not found" }, { status: 404 });
      }),
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI/issues/600/labels",
        async ({ request }) => {
          const body: unknown = await request.json();
          labelsAdded = body.labels || [];
          return HttpResponse.json(labelsAdded.map((name) => ({ name, color: "000000" })));
        },
      ),
    );

    await GithubIssuePrioritiesLabler();

    // Verify Low-Priority was still added despite removal error
    expect(labelsAdded).toEqual(["Low-Priority"]);
  });

  it("should handle multiple tasks with different priorities", async () => {
    mockNotionPages = [
      {
        id: "page-1",
        last_edited_time: "2025-01-10T10:00:00Z",
        properties: {
          Task: { title: [{ plain_text: "High priority task" }] },
          Priority: { select: { name: "High" } },
          "[GH🤖] Link": { url: "https://github.com/Comfy-Org/ComfyUI/issues/1001" },
        },
      },
      {
        id: "page-2",
        last_edited_time: "2025-01-10T11:00:00Z",
        properties: {
          Task: { title: [{ plain_text: "Medium priority task" }] },
          Priority: { select: { name: "Medium" } },
          "[GH🤖] Link": { url: "https://github.com/Comfy-Org/ComfyUI/issues/1002" },
        },
      },
      {
        id: "page-3",
        last_edited_time: "2025-01-10T12:00:00Z",
        properties: {
          Task: { title: [{ plain_text: "Low priority task" }] },
          Priority: { select: { name: "Low" } },
          "[GH🤖] Link": { url: "https://github.com/Comfy-Org/ComfyUI/issues/1003" },
        },
      },
    ];

    const labelsAddedByIssue: Record<number, string[]> = {};

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/:number/labels", () => {
        return HttpResponse.json([]);
      }),
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI/issues/:number/labels",
        async ({ request, params }) => {
          const body: unknown = await request.json();
          const issueNumber = parseInt(params.number as string);
          labelsAddedByIssue[issueNumber] = body.labels || [];
          return HttpResponse.json(body.labels.map((name: string) => ({ name, color: "000000" })));
        },
      ),
    );

    await GithubIssuePrioritiesLabler();

    // Verify all three issues got correct labels
    expect(labelsAddedByIssue[1001]).toEqual(["High-Priority"]);
    expect(labelsAddedByIssue[1002]).toEqual(["Medium-Priority"]);
    expect(labelsAddedByIssue[1003]).toEqual(["Low-Priority"]);
  });

  it("should resume from checkpoint", async () => {
    // Set an existing checkpoint
    keyvStorage.set("checkpoint", {
      id: "page-1",
      editedAt: "2025-01-10T10:00:00Z",
    });

    mockNotionPages = [
      {
        id: "page-1",
        last_edited_time: "2025-01-10T10:00:00Z",
        properties: {
          Task: { title: [{ plain_text: "Already processed" }] },
          Priority: { select: { name: "High" } },
          "[GH🤖] Link": { url: "https://github.com/Comfy-Org/ComfyUI/issues/2001" },
        },
      },
      {
        id: "page-2",
        last_edited_time: "2025-01-10T11:00:00Z",
        properties: {
          Task: { title: [{ plain_text: "New task" }] },
          Priority: { select: { name: "Medium" } },
          "[GH🤖] Link": { url: "https://github.com/Comfy-Org/ComfyUI/issues/2002" },
        },
      },
    ];

    let processedIssues: number[] = [];

    server.use(
      http.get("https://api.github.com/repos/Comfy-Org/ComfyUI/issues/:number/labels", () => {
        return HttpResponse.json([]);
      }),
      http.post(
        "https://api.github.com/repos/Comfy-Org/ComfyUI/issues/:number/labels",
        async ({ params }) => {
          const issueNumber = parseInt(params.number as string);
          processedIssues.push(issueNumber);
          return HttpResponse.json([]);
        },
      ),
    );

    await GithubIssuePrioritiesLabler();

    // Verify only the new task (page-2) was processed, page-1 was skipped
    expect(processedIssues).toEqual([2002]);
  });
});
