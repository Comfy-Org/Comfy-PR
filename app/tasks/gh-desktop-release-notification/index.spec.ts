import { gh } from "@/lib/github";
import { getSlackChannel } from "@/lib/slack/channels";
import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { upsertSlackMessage } from "./upsertSlackMessage";

jest.mock("@/src/gh");
jest.mock("@/src/slack/channels");
jest.mock("./upsertSlackMessage");

const mockCollection = {
  createIndex: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue(null),
  findOneAndUpdate: jest.fn().mockImplementation((_filter, update) => Promise.resolve(update.$set)),
};

jest.mock("@/src/db", () => ({
  db: {
    collection: jest.fn(() => mockCollection),
  },
}));

import runGithubDesktopReleaseNotificationTask from "./index";

describe("GithubDesktopReleaseNotificationTask", () => {
  const mockGh = gh as jest.Mocked<typeof gh>;
  const mockGetSlackChannel = getSlackChannel as jest.MockedFunction<typeof getSlackChannel>;
  const mockUpsertSlackMessage = upsertSlackMessage as jest.MockedFunction<
    typeof upsertSlackMessage
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.findOneAndUpdate.mockImplementation((_filter, update) =>
      Promise.resolve(update.$set),
    );

    mockGetSlackChannel.mockResolvedValue({
      id: "test-channel-id",
      name: "desktop",
    } as any);

    mockUpsertSlackMessage.mockResolvedValue({
      text: "mocked message",
      channel: "test-channel-id",
      url: "https://slack.com/message/123",
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe("Draft Release Processing - Bug Fix Verification", () => {
    it("should save draft messages to slackMessageDrafting field, not slackMessage", async () => {
      const mockDraftRelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft",
        tag_name: "v1.0.0-draft",
        draft: true,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: null,
        body: "Draft release notes",
      };

      mockGh.repos = {
        listReleases: jest.fn().mockResolvedValue({
          data: [mockDraftRelease],
        }),
      } as any;

      // First call - save initial draft data
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockDraftRelease.html_url,
        version: mockDraftRelease.tag_name,
        status: "draft",
        isStable: false,
        createdAt: new Date(mockDraftRelease.created_at),
        releasedAt: undefined,
      });

      // No coreTask
      mockCollection.findOne.mockResolvedValueOnce(null);

      // Second call - save with drafting message in correct field
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockDraftRelease.html_url,
        version: mockDraftRelease.tag_name,
        status: "draft",
        isStable: false,
        slackMessageDrafting: {
          text: "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft|Release v1.0.0-draft> is draft!",
          channel: "test-channel-id",
          url: "https://slack.com/message/draft-123",
        },
      });

      await runGithubDesktopReleaseNotificationTask();

      // Verify the second save call has slackMessageDrafting field
      expect(mockCollection.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { url: mockDraftRelease.html_url },
        {
          $set: expect.objectContaining({
            url: mockDraftRelease.html_url,
            slackMessageDrafting: expect.objectContaining({
              text: expect.any(String),
              channel: "test-channel-id",
              url: expect.any(String),
            }),
          }),
        },
        { upsert: true, returnDocument: "after" },
      );

      // Ensure slackMessage field was NOT set
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalledWith(
        expect.anything(),
        {
          $set: expect.objectContaining({
            slackMessage: expect.anything(),
          }),
        },
        expect.anything(),
      );
    });

    it("should not send duplicate draft messages when text hasn't changed", async () => {
      const mockDraftRelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft",
        tag_name: "v1.0.0-draft",
        draft: true,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: null,
        body: "Draft release notes",
      };

      mockGh.repos = {
        listReleases: jest.fn().mockResolvedValue({
          data: [mockDraftRelease],
        }),
      } as any;

      const expectedText =
        "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft|Release v1.0.0-draft> is draft!";

      // Return task with existing drafting message matching new message
      mockCollection.findOneAndUpdate.mockResolvedValue({
        url: mockDraftRelease.html_url,
        version: mockDraftRelease.tag_name,
        status: "draft",
        isStable: false,
        createdAt: new Date(mockDraftRelease.created_at),
        slackMessageDrafting: {
          text: expectedText,
          channel: "test-channel-id",
          url: "https://slack.com/message/draft-123",
        },
      });

      // No coreTask
      mockCollection.findOne.mockResolvedValue(null);

      await runGithubDesktopReleaseNotificationTask();

      // Should NOT call upsertSlackMessage since text hasn't changed
      expect(mockUpsertSlackMessage).not.toHaveBeenCalled();

      // Should only have one save call (initial data)
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it("should update draft message when text changes", async () => {
      const mockDraftRelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.1-draft",
        tag_name: "v1.0.1-draft", // Changed version
        draft: true,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: null,
        body: "Updated draft release notes",
      };

      mockGh.repos = {
        listReleases: jest.fn().mockResolvedValue({
          data: [mockDraftRelease],
        }),
      } as any;

      // Return task with old drafting message text
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockDraftRelease.html_url,
        version: "v1.0.0-draft", // Old version
        status: "draft",
        isStable: false,
        createdAt: new Date(mockDraftRelease.created_at),
        slackMessageDrafting: {
          text: "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-draft|Release v1.0.0-draft> is draft!",
          channel: "test-channel-id",
          url: "https://slack.com/message/draft-123",
        },
      });

      // No coreTask
      mockCollection.findOne.mockResolvedValueOnce(null);

      // Second call after update
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockDraftRelease.html_url,
        version: mockDraftRelease.tag_name,
        status: "draft",
        isStable: false,
        slackMessageDrafting: {
          text: "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.1-draft|Release v1.0.1-draft> is draft!",
          channel: "test-channel-id",
          url: "https://slack.com/message/draft-123",
        },
      });

      await runGithubDesktopReleaseNotificationTask();

      // Should update the drafting message since text changed
      expect(mockUpsertSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("v1.0.1-draft"),
        }),
      );
    });
  });

  describe("Stable Release Processing", () => {
    it("should save stable messages to slackMessage field", async () => {
      const mockStableRelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0",
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Stable release notes",
      };

      mockGh.repos = {
        listReleases: jest.fn().mockResolvedValue({
          data: [mockStableRelease],
        }),
      } as any;

      // First call - save initial data
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockStableRelease.html_url,
        version: mockStableRelease.tag_name,
        status: "stable",
        isStable: true,
        createdAt: new Date(mockStableRelease.created_at),
        releasedAt: new Date(mockStableRelease.published_at),
      });

      // No coreTask
      mockCollection.findOne.mockResolvedValueOnce(null);

      // Second call - save with stable message
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockStableRelease.html_url,
        version: mockStableRelease.tag_name,
        status: "stable",
        isStable: true,
        slackMessage: {
          text: "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0|Release v1.0.0> is stable!",
          channel: "test-channel-id",
          url: "https://slack.com/message/stable-123",
        },
      });

      await runGithubDesktopReleaseNotificationTask();

      // Verify the second save call has slackMessage field
      expect(mockCollection.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { url: mockStableRelease.html_url },
        {
          $set: expect.objectContaining({
            url: mockStableRelease.html_url,
            slackMessage: expect.objectContaining({
              text: expect.any(String),
              channel: "test-channel-id",
              url: expect.any(String),
            }),
          }),
        },
        { upsert: true, returnDocument: "after" },
      );
    });

    it("should not send duplicate stable messages when text hasn't changed", async () => {
      const mockStableRelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0",
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Stable release notes",
      };

      mockGh.repos = {
        listReleases: jest.fn().mockResolvedValue({
          data: [mockStableRelease],
        }),
      } as any;

      const expectedText =
        "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0|Release v1.0.0> is stable!";

      // Return task with existing message matching new message
      mockCollection.findOneAndUpdate.mockResolvedValue({
        url: mockStableRelease.html_url,
        version: mockStableRelease.tag_name,
        status: "stable",
        isStable: true,
        createdAt: new Date(mockStableRelease.created_at),
        releasedAt: new Date(mockStableRelease.published_at),
        slackMessage: {
          text: expectedText,
          channel: "test-channel-id",
          url: "https://slack.com/message/stable-123",
        },
      });

      // No coreTask
      mockCollection.findOne.mockResolvedValue(null);

      await runGithubDesktopReleaseNotificationTask();

      // Should NOT call upsertSlackMessage since text hasn't changed
      expect(mockUpsertSlackMessage).not.toHaveBeenCalled();
    });
  });

  describe("Prerelease Processing", () => {
    it("should save prerelease messages to slackMessageDrafting field", async () => {
      const mockPrerelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-beta.1",
        tag_name: "v1.0.0-beta.1",
        draft: false,
        prerelease: true,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Beta release notes",
      };

      mockGh.repos = {
        listReleases: jest.fn().mockResolvedValue({
          data: [mockPrerelease],
        }),
      } as any;

      // First call - save initial data
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockPrerelease.html_url,
        version: mockPrerelease.tag_name,
        status: "prerelease",
        isStable: false,
        createdAt: new Date(mockPrerelease.created_at),
        releasedAt: new Date(mockPrerelease.published_at),
      });

      // No coreTask
      mockCollection.findOne.mockResolvedValueOnce(null);

      // Second call - save with drafting message
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockPrerelease.html_url,
        version: mockPrerelease.tag_name,
        status: "prerelease",
        isStable: false,
        slackMessageDrafting: {
          text: "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0-beta.1|Release v1.0.0-beta.1> is prerelease!",
          channel: "test-channel-id",
          url: "https://slack.com/message/pre-123",
        },
      });

      await runGithubDesktopReleaseNotificationTask();

      // Verify the save call has slackMessageDrafting field, not slackMessage
      expect(mockCollection.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { url: mockPrerelease.html_url },
        {
          $set: expect.objectContaining({
            url: mockPrerelease.html_url,
            slackMessageDrafting: expect.objectContaining({
              text: expect.any(String),
              channel: "test-channel-id",
              url: expect.any(String),
            }),
          }),
        },
        { upsert: true, returnDocument: "after" },
      );
    });
  });

  describe("Core Version Integration", () => {
    it("should include core version in message when desktop release references ComfyUI core", async () => {
      const mockDesktopRelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0",
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Update ComfyUI core to v0.2.0\n\nOther changes...",
      };

      mockGh.repos = {
        listReleases: jest.fn().mockResolvedValue({
          data: [mockDesktopRelease],
        }),
      } as any;

      // First call - save initial data with core version extracted
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockDesktopRelease.html_url,
        version: mockDesktopRelease.tag_name,
        status: "stable",
        isStable: true,
        coreVersion: "v0.2.0",
        createdAt: new Date(mockDesktopRelease.created_at),
        releasedAt: new Date(mockDesktopRelease.published_at),
      });

      // Find core task
      mockCollection.findOne.mockResolvedValueOnce({
        version: "v0.2.0",
        slackMessage: {
          text: "ComfyUI core v0.2.0 released",
          url: "https://slack.com/message/core-123",
        },
      });

      // Second call - save with message including core version
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockDesktopRelease.html_url,
        version: mockDesktopRelease.tag_name,
        status: "stable",
        isStable: true,
        coreVersion: "v0.2.0",
        slackMessage: {
          text: "🔮 desktop <https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0|Release v1.0.0> is stable! Core: v0.2.0",
          channel: "test-channel-id",
          url: "https://slack.com/message/desktop-123",
        },
      });

      await runGithubDesktopReleaseNotificationTask();

      expect(mockUpsertSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Core: v0.2.0"),
        }),
      );
    });
  });

  describe("Repository Configuration", () => {
    it("should process both ComfyUI and desktop repositories", async () => {
      const mockComfyUIRelease = {
        html_url: "https://github.com/comfyanonymous/ComfyUI/releases/tag/v0.3.0",
        tag_name: "v0.3.0",
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "ComfyUI release",
      };

      const mockDesktopRelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v1.0.0",
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Desktop release",
      };

      mockGh.repos = {
        listReleases: jest
          .fn()
          .mockResolvedValueOnce({ data: [mockComfyUIRelease] })
          .mockResolvedValueOnce({ data: [mockDesktopRelease] }),
      } as any;

      // Mock responses for both releases
      mockCollection.findOneAndUpdate.mockResolvedValue({
        url: "mock",
        status: "stable",
        isStable: true,
        createdAt: new Date(),
      });

      mockCollection.findOne.mockResolvedValue(null);

      await runGithubDesktopReleaseNotificationTask();

      // Verify both repositories were queried
      expect(mockGh.repos.listReleases).toHaveBeenCalledWith({
        owner: "comfyanonymous",
        repo: "ComfyUI",
        per_page: 3,
      });

      expect(mockGh.repos.listReleases).toHaveBeenCalledWith({
        owner: "Comfy-Org",
        repo: "desktop",
        per_page: 3,
      });
    });
  });

  describe("Date Filtering", () => {
    it("should skip releases created before sendSince date", async () => {
      const oldRelease = {
        html_url: "https://github.com/Comfy-Org/desktop/releases/tag/v0.1.0",
        tag_name: "v0.1.0",
        draft: false,
        prerelease: false,
        created_at: "2024-01-01T00:00:00Z",
        published_at: "2024-01-01T00:00:00Z",
        body: "Old release",
      };

      mockGh.repos = {
        listReleases: jest.fn().mockResolvedValue({
          data: [oldRelease],
        }),
      } as any;

      mockCollection.findOneAndUpdate.mockResolvedValue({
        url: oldRelease.html_url,
        version: oldRelease.tag_name,
        status: "stable",
        isStable: true,
        createdAt: new Date(oldRelease.created_at),
        releasedAt: new Date(oldRelease.published_at),
      });

      mockCollection.findOne.mockResolvedValue(null);

      await runGithubDesktopReleaseNotificationTask();

      // Should save the release but not send a message
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpsertSlackMessage).not.toHaveBeenCalled();
    });
  });

  describe("Database Index", () => {
    it("should create unique index on url field", async () => {
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ url: 1 }, { unique: true });
    });
  });
});
