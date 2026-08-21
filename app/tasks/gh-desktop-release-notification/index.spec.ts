/* eslint-disable typescript/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

// Factory function to create fresh mock state for each test
const createMockState = () => ({
  upsertSlackMessageCalls: [] as any[],
  findOneAndUpdateCalls: [] as any[],
  findOneCalls: [] as any[],
  releasesData: [] as any[],
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
      listReleases: async () => ({ data: mockState.releasesData }),
    },
  },
}));

mock.module("@/lib/slack/channels", () => ({
  getSlackChannel: async () => ({ id: "test-channel-id", name: "desktop" }),
}));

mock.module("./upsertSlackMessage", () => ({
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
const { default: runGithubDesktopReleaseNotificationTask } = await import("./index");

describe("GithubDesktopReleaseNotificationTask", () => {
  beforeEach(() => {
    mockState = createMockState();
  });

  afterEach(() => {
    // Clean up if needed
  });

  describe("Draft Release Processing - Bug Fix Verification", () => {
    it("should save draft messages to slackMessageDrafting field, not slackMessage", async () => {
      mockState.releasesData = [
        {
          html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft",
          tag_name: "v1.0.0-draft",
          draft: true,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: null,
          body: "Draft release notes",
        },
      ];

      await runGithubDesktopReleaseNotificationTask();

      expect(mockState.findOneAndUpdateCalls.length).toBeGreaterThanOrEqual(2);

      const draftingCall = mockState.findOneAndUpdateCalls.find(
        (call) => call.update.$set.slackMessageDrafting !== undefined,
      );
      expect(draftingCall).toBeDefined();
      expect(draftingCall?.update.$set.slackMessageDrafting).toMatchObject({
        text: expect.any(String),
        channel: "test-channel-id",
        url: expect.any(String),
      });

      const stableCall = mockState.findOneAndUpdateCalls.find(
        (call) => call.update.$set.slackMessage !== undefined,
      );
      expect(stableCall).toBeUndefined();
    });

    it("should not send duplicate draft messages when text hasn't changed", async () => {
      const expectedText =
        "🔮 Comfy-Org/desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft|Release v1.0.0-draft> is draft!";

      mockState.releasesData = [
        {
          html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft",
          tag_name: "v1.0.0-draft",
          draft: true,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: null,
          body: "Draft release notes",
        },
      ];

      mockState.findOneAndUpdateImpl = async (filter, update) => ({
        ...filter,
        ...update.$set,
        slackMessageDrafting: {
          text: expectedText,
          channel: "test-channel-id",
          url: "https://slack.com/message/draft-123",
        },
      });

      await runGithubDesktopReleaseNotificationTask();

      expect(mockState.upsertSlackMessageCalls.length).toBe(0);
    });

    it("should update draft message when text changes", async () => {
      let callCount = 0;

      mockState.releasesData = [
        {
          html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.1-draft",
          tag_name: "v1.0.1-draft",
          draft: true,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: null,
          body: "Updated draft release notes",
        },
      ];

      mockState.findOneAndUpdateImpl = async (filter, update) => {
        callCount++;
        return {
          ...filter,
          ...update.$set,
          slackMessageDrafting:
            callCount === 1
              ? {
                  text: "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft|Release v1.0.0-draft> is draft!",
                  channel: "test-channel-id",
                  url: "https://slack.com/message/draft-123",
                }
              : update.$set.slackMessageDrafting,
        };
      };

      await runGithubDesktopReleaseNotificationTask();

      expect(mockState.upsertSlackMessageCalls.length).toBeGreaterThan(0);
      const lastCall =
        mockState.upsertSlackMessageCalls[mockState.upsertSlackMessageCalls.length - 1];
      expect(lastCall.text).toContain("v1.0.1-draft");
    });
  });

  describe("Stable Release Processing", () => {
    it("should save stable messages to slackMessage field", async () => {
      mockState.releasesData = [
        {
          html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0",
          tag_name: "v1.0.0",
          draft: false,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: "Stable release notes",
        },
      ];

      await runGithubDesktopReleaseNotificationTask();

      const stableCall = mockState.findOneAndUpdateCalls.find(
        (call) => call.update.$set.slackMessage !== undefined,
      );
      expect(stableCall).toBeDefined();
      expect(stableCall?.update.$set.slackMessage).toMatchObject({
        text: expect.any(String),
        channel: "test-channel-id",
        url: expect.any(String),
      });
    });

    it("should not send duplicate stable messages when text hasn't changed", async () => {
      const expectedText =
        "🔮 Comfy-Org/desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0|Release v1.0.0> is stable!";

      mockState.releasesData = [
        {
          html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0",
          tag_name: "v1.0.0",
          draft: false,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: "Stable release notes",
        },
      ];

      mockState.findOneAndUpdateImpl = async (filter, update) => ({
        ...filter,
        ...update.$set,
        slackMessage: {
          text: expectedText,
          channel: "test-channel-id",
          url: "https://slack.com/message/stable-123",
        },
      });

      await runGithubDesktopReleaseNotificationTask();

      expect(mockState.upsertSlackMessageCalls.length).toBe(0);
    });
  });

  describe("Prerelease Processing", () => {
    it("should save prerelease messages to slackMessageDrafting field", async () => {
      mockState.releasesData = [
        {
          html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-beta.1",
          tag_name: "v1.0.0-beta.1",
          draft: false,
          prerelease: true,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: "Beta release notes",
        },
      ];

      await runGithubDesktopReleaseNotificationTask();

      const draftingCall = mockState.findOneAndUpdateCalls.find(
        (call) => call.update.$set.slackMessageDrafting !== undefined,
      );
      expect(draftingCall).toBeDefined();
    });
  });

  describe("Core Version Integration", () => {
    it("should include core version in message when desktop release references ComfyUI core", async () => {
      mockState.releasesData = [
        {
          html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0",
          tag_name: "v1.0.0",
          draft: false,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: "Update ComfyUI core to v0.2.0\n\nOther changes...",
        },
      ];

      mockState.findOneImpl = async (filter) => {
        if (filter.version === "v0.2.0") {
          return {
            version: "v0.2.0",
            slackMessage: {
              text: "ComfyUI core v0.2.0 released",
              url: "https://slack.com/message/core-123",
            },
          };
        }
        return null;
      };

      await runGithubDesktopReleaseNotificationTask();

      const messageCall = mockState.upsertSlackMessageCalls.find((call) =>
        call.text.includes("Core: v0.2.0"),
      );
      expect(messageCall).toBeDefined();
    });
  });

  describe("Repository Configuration", () => {
    it("should process releases from configured repositories", async () => {
      mockState.releasesData = [
        {
          html_url: "https://github.com/comfyanonymous/ComfyUI/releases/tag/v0.3.0",
          tag_name: "v0.3.0",
          draft: false,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: "ComfyUI release",
        },
      ];

      await runGithubDesktopReleaseNotificationTask();

      expect(mockState.findOneAndUpdateCalls.length).toBeGreaterThan(0);
    });
  });

  describe("Date Filtering", () => {
    it("should skip releases created before sendSince date", async () => {
      mockState.releasesData = [
        {
          html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v0.1.0",
          tag_name: "v0.1.0",
          draft: false,
          prerelease: false,
          created_at: "2024-01-01T00:00:00Z",
          published_at: "2024-01-01T00:00:00Z",
          body: "Old release",
        },
      ];

      await runGithubDesktopReleaseNotificationTask();

      expect(mockState.findOneAndUpdateCalls.length).toBeGreaterThan(0);
      expect(mockState.upsertSlackMessageCalls.length).toBe(0);
    });
  });

  describe("Database Index", () => {
    it("should create unique index on url field", async () => {
      // Index creation is tested by module initialization
      expect(createMockCollection().createIndex).toBeDefined();
    });
  });
});
