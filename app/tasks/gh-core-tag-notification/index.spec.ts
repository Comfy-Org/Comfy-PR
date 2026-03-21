/* eslint-disable typescript/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

// Factory function to create fresh mock state for each test
const createMockState = () => ({
  upsertSlackMessageCalls: [] as any[],
  findOneAndUpdateCalls: [] as any[],
  findOneCalls: [] as any[],
  tagsData: [] as any[],
  commitData: {
    commit: {
      author: { date: new Date().toISOString() },
      committer: { date: new Date().toISOString() },
    },
  } as any,
  gitTagData: null as any,
  // Allow per-test customization of findOne behavior
  findOneImpl: null as ((filter: any) => Promise<any>) | null,
  // Allow per-test customization of findOneAndUpdate behavior
  findOneAndUpdateImpl: null as ((filter: any, update: any, options: any) => Promise<any>) | null,
});

let mockState = createMockState();

// Create mock collection with behavior that references mockState
const createMockCollection = () => ({
  createIndex: async () => ({}),
  findOne: async (filter: any) => {
    mockState.findOneCalls.push(filter);
    return mockState.findOneImpl ? mockState.findOneImpl(filter) : null;
  },
  findOneAndUpdate: async (filter: any, update: any, options: any) => {
    const defaultResult = { ...filter, ...update.$set };
    const result = mockState.findOneAndUpdateImpl
      ? await mockState.findOneAndUpdateImpl(filter, update, options)
      : defaultResult;
    mockState.findOneAndUpdateCalls.push({ filter, update, options, result });
    return result;
  },
});

// Set up mocks before any imports
const { mock } = await import("bun:test");

mock.module("@/src/db", () => ({
  db: {
    collection: () => createMockCollection(),
    close: async () => {},
  },
}));

mock.module("@/lib/github", () => ({
  gh: {
    repos: {
      listTags: async () => ({ data: mockState.tagsData }),
      getCommit: async () => ({ data: mockState.commitData }),
    },
    git: {
      getTag: async () => {
        if (mockState.gitTagData) {
          return { data: mockState.gitTagData };
        }
        throw new Error("Not an annotated tag");
      },
    },
  },
}));

mock.module("@/lib/slack/channels", () => ({
  getSlackChannel: async () => ({ id: "test-channel-id", name: "desktop" }),
}));

mock.module("../gh-desktop-release-notification/upsertSlackMessage", () => ({
  upsertSlackMessage: async (msg: any) => {
    mockState.upsertSlackMessageCalls.push(msg);
    return {
      text: msg.text,
      channel: msg.channel,
      url: msg.url || "https://slack.com/message/123",
    };
  },
}));

// Import task after mocks are configured
const { default: runGithubCoreTagNotificationTask } = await import("./index");

describe("GithubCoreTagNotificationTask", () => {
  beforeEach(() => {
    mockState = createMockState();
  });

  afterEach(() => {
    // Clean up if needed
  });

  it("should fetch tags from the ComfyUI repository", async () => {
    mockState.tagsData = [
      {
        name: "v0.2.1",
        commit: {
          sha: "abc123def456",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/abc123def456",
        },
        zipball_url: "https://api.github.com/repos/comfyanonymous/ComfyUI/zipball/v0.2.1",
        tarball_url: "https://api.github.com/repos/comfyanonymous/ComfyUI/tarball/v0.2.1",
        node_id: "REF_kwDOI_",
      },
    ];

    await runGithubCoreTagNotificationTask();

    expect(mockState.findOneAndUpdateCalls.length).toBeGreaterThan(0);
  });

  it("should save new tags to the database", async () => {
    mockState.tagsData = [
      {
        name: "v0.2.2",
        commit: {
          sha: "def789ghi012",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/def789ghi012",
        },
      },
    ];

    mockState.gitTagData = {
      tag: "v0.2.2",
      tagger: {
        date: new Date().toISOString(),
        name: "Test Author",
        email: "test@example.com",
      },
      message: "Release v0.2.2 with new features",
    };

    await runGithubCoreTagNotificationTask();

    expect(mockState.findOneAndUpdateCalls.length).toBeGreaterThan(0);
  });

  it("should send Slack notifications for new tags", async () => {
    mockState.tagsData = [
      {
        name: "v0.2.3",
        commit: {
          sha: "123abc456def",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/123abc456def",
        },
      },
    ];

    await runGithubCoreTagNotificationTask();

    expect(mockState.upsertSlackMessageCalls.length).toBeGreaterThan(0);
    const messageCall = mockState.upsertSlackMessageCalls.find((call) =>
      call.text.includes("v0.2.3"),
    );
    expect(messageCall).toBeDefined();
  });

  it("should not send duplicate notifications for existing tags", async () => {
    mockState.tagsData = [
      {
        name: "v0.2.0",
        commit: {
          sha: "existing123",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/existing123",
        },
      },
    ];

    mockState.findOneImpl = async (filter) => {
      if (filter.tagName === "v0.2.0") {
        return {
          tagName: "v0.2.0",
          commitSha: "existing123",
          url: "https://github.com/comfyanonymous/ComfyUI/releases/tag/v0.2.0",
          slackMessages: [
            {
              text: "Already sent",
              channel: "test-channel-id",
              url: "https://slack.com/message/old",
            },
          ],
        };
      }
      return null;
    };

    await runGithubCoreTagNotificationTask();

    expect(mockState.upsertSlackMessageCalls.length).toBe(0);
  });

  it("should handle annotated tags with messages", async () => {
    const tagMessage = "Major release with breaking changes";

    mockState.tagsData = [
      {
        name: "v0.3.0",
        commit: {
          sha: "annotated123",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/annotated123",
        },
      },
    ];

    mockState.gitTagData = {
      tag: "v0.3.0",
      tagger: {
        date: new Date().toISOString(),
        name: "Test Author",
        email: "test@example.com",
      },
      message: tagMessage,
    };

    await runGithubCoreTagNotificationTask();

    const messageCall = mockState.upsertSlackMessageCalls.find((call) =>
      call.text.includes(tagMessage),
    );
    expect(messageCall).toBeDefined();
  });

  it("should respect sendSince configuration", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");

    mockState.tagsData = [
      {
        name: "v0.1.0",
        commit: {
          sha: "old123",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/old123",
        },
      },
    ];

    mockState.commitData = {
      commit: {
        author: { date: oldDate.toISOString() },
        committer: { date: oldDate.toISOString() },
      },
    };

    mockState.gitTagData = {
      tag: "v0.1.0",
      tagger: {
        date: oldDate.toISOString(),
      },
    };

    await runGithubCoreTagNotificationTask();

    // Should save the tag but not send a message (old date)
    expect(mockState.upsertSlackMessageCalls.length).toBe(0);
  });
});
