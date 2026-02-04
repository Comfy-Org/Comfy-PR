import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// Mock db module BEFORE importing anything that uses it
const mockDb = {
  collection: mock(() => ({
    findOne: mock(),
    findOneAndUpdate: mock(),
    createIndex: mock(),
  })),
  close: mock(),
};
mock.module("@/src/db", () => ({ db: mockDb }));
mock.module("@/src/gh", () => ({ gh: {} }));
mock.module("@/src/slack/channels", () => ({ getSlackChannel: mock() }));
mock.module("../gh-desktop-release-notification/upsertSlackMessage", () => ({ upsertSlackMessage: mock() }));

// Now we can import the modules that depend on mocked modules
const { db } = await import("@/src/db");
const { gh } = await import("@/src/gh");
const { getSlackChannel } = await import("@/src/slack/channels");
const { upsertSlackMessage } = await import("../gh-desktop-release-notification/upsertSlackMessage");
const { default: runGithubFrontendReleaseNotificationTask } = await import("./index");

const mockGh = gh as any;
const mockGetSlackChannel = getSlackChannel as any;
const mockUpsertSlackMessage = upsertSlackMessage as any;

describe("GithubFrontendReleaseNotificationTask", () => {
  let collection: any;

  beforeEach(async () => {
    collection = {
      findOne: mock(),
      findOneAndUpdate: mock(),
      createIndex: mock(),
    };

    spyOn(db, "collection").mockReturnValue(collection);

    mockGetSlackChannel.mockResolvedValue({
      id: "test-channel-id",
      name: "frontend",
    } as any);

    mockUpsertSlackMessage.mockResolvedValue({
      text: "mocked message",
      channel: "test-channel-id",
      url: "https://slack.com/message/123",
    });
  });

  afterEach(async () => {
    // Cleanup
  });

  describe("parseGithubRepoUrl", () => {
    it("should correctly parse ComfyUI_frontend repo URL", () => {
      const result = parseGithubRepoUrl("https://github.com/Comfy-Org/ComfyUI_frontend");
      expect(result).toEqual({
        owner: "Comfy-Org",
        repo: "ComfyUI_frontend",
      });
    });
  });

  describe("Release Processing", () => {
    it("should process stable releases and send message only on first occurrence", async () => {
      const mockRelease = {
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Release notes",
      };

      mockGh.repos = {
        listReleases: mock(() =>
          Promise.resolve({
            data: [mockRelease],
          }),
        ),
      } as any;

      // First call - no existing message
      collection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockRelease.html_url,
        version: mockRelease.tag_name,
        status: "stable",
        isStable: true,
        releaseNotes: mockRelease.body,
        createdAt: new Date(mockRelease.created_at),
        releasedAt: new Date(mockRelease.published_at),
      });

      // Second call - save with message
      collection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockRelease.html_url,
        version: mockRelease.tag_name,
        status: "stable",
        isStable: true,
        releaseNotes: mockRelease.body,
        createdAt: new Date(mockRelease.created_at),
        releasedAt: new Date(mockRelease.published_at),
        slackMessage: {
          text: "🎨 ComfyUI_frontend <https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0|Release v1.0.0> is stable!\n\n*Release Notes:*\nRelease notes",
          channel: "test-channel-id",
          url: "https://slack.com/message/123",
        },
      });

      await runGithubFrontendReleaseNotificationTask();

      expect(mockGh.repos.listReleases).toHaveBeenCalledWith({
        owner: "Comfy-Org",
        repo: "ComfyUI_frontend",
        per_page: 3,
      });

      expect(upsertSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "test-channel-id",
          text: expect.stringContaining("stable"),
        }),
      );
    });

    it("should not send duplicate messages for unchanged releases", async () => {
      const mockRelease = {
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Release notes",
      };

      mockGh.repos = {
        listReleases: mock(() =>
          Promise.resolve({
            data: [mockRelease],
          }),
        ),
      } as any;

      // Return task with existing message text matching new message
      collection.findOneAndUpdate.mockResolvedValue({
        url: mockRelease.html_url,
        version: mockRelease.tag_name,
        status: "stable",
        isStable: true,
        releaseNotes: mockRelease.body,
        createdAt: new Date(mockRelease.created_at),
        releasedAt: new Date(mockRelease.published_at),
        slackMessage: {
          text: "🎨 ComfyUI_frontend <https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0|Release v1.0.0> is stable!\n\n*Release Notes:*\nRelease notes",
          channel: "test-channel-id",
          url: "https://slack.com/message/123",
        },
      });

      await runGithubFrontendReleaseNotificationTask();

      // Should not call upsertSlackMessage since text hasn't changed
      expect(upsertSlackMessage).not.toHaveBeenCalled();
    });

    it("should process prerelease and send drafting message", async () => {
      const mockPrerelease = {
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0-beta.1",
        tag_name: "v1.0.0-beta.1",
        draft: false,
        prerelease: true,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Beta release notes",
      };

      mockGh.repos = {
        listReleases: mock(() =>
          Promise.resolve({
            data: [mockPrerelease],
          }),
        ),
      } as any;

      // First call - save initial data
      collection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockPrerelease.html_url,
        version: mockPrerelease.tag_name,
        status: "prerelease",
        isStable: false,
        releaseNotes: mockPrerelease.body,
        createdAt: new Date(mockPrerelease.created_at),
        releasedAt: new Date(mockPrerelease.published_at),
      });

      // Second call - save with drafting message
      collection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockPrerelease.html_url,
        version: mockPrerelease.tag_name,
        status: "prerelease",
        isStable: false,
        releaseNotes: mockPrerelease.body,
        createdAt: new Date(mockPrerelease.created_at),
        releasedAt: new Date(mockPrerelease.published_at),
        slackMessageDrafting: {
          text: "🎨 ComfyUI_frontend <https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0-beta.1|Release v1.0.0-beta.1> is prerelease!\n\n*Release Notes:*\nBeta release notes",
          channel: "test-channel-id",
          url: "https://slack.com/message/456",
        },
      });

      await runGithubFrontendReleaseNotificationTask();

      expect(upsertSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "test-channel-id",
          text: expect.stringContaining("prerelease"),
        }),
      );
    });

    it("should process draft releases", async () => {
      const mockDraft = {
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v2.0.0",
        tag_name: "v2.0.0",
        draft: true,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: null,
        body: "Draft release notes",
      };

      mockGh.repos = {
        listReleases: mock(() =>
          Promise.resolve({
            data: [mockDraft],
          }),
        ),
      } as any;

      collection.findOneAndUpdate.mockResolvedValue({
        url: mockDraft.html_url,
        version: mockDraft.tag_name,
        status: "draft",
        isStable: false,
        releaseNotes: mockDraft.body,
        createdAt: new Date(mockDraft.created_at),
        releasedAt: undefined,
      });

      await runGithubFrontendReleaseNotificationTask();

      expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
        { url: mockDraft.html_url },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "draft",
            isStable: false,
            releasedAt: undefined,
          }),
        }),
        { upsert: true, returnDocument: "after" },
      );
    });

    it("should skip old releases before sendSince date", async () => {
      const oldRelease = {
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v0.1.0",
        tag_name: "v0.1.0",
        draft: false,
        prerelease: false,
        created_at: "2024-01-01T00:00:00Z",
        published_at: "2024-01-01T00:00:00Z",
        body: "Old release",
      };

      mockGh.repos = {
        listReleases: mock(() =>
          Promise.resolve({
            data: [oldRelease],
          }),
        ),
      } as any;

      collection.findOneAndUpdate.mockResolvedValue({
        url: oldRelease.html_url,
        version: oldRelease.tag_name,
        status: "stable",
        isStable: true,
        releaseNotes: oldRelease.body,
        createdAt: new Date(oldRelease.created_at),
        releasedAt: new Date(oldRelease.published_at),
      });

      await runGithubFrontendReleaseNotificationTask();

      // Should save the release but not send a message
      expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(upsertSlackMessage).not.toHaveBeenCalled();
    });

    it("should update message when release text changes", async () => {
      const mockRelease = {
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
        tag_name: "v1.0.1", // Changed version
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: "Updated release notes",
      };

      mockGh.repos = {
        listReleases: mock(() =>
          Promise.resolve({
            data: [mockRelease],
          }),
        ),
      } as any;

      // Return task with old message text
      collection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockRelease.html_url,
        version: mockRelease.tag_name,
        status: "stable",
        isStable: true,
        releaseNotes: mockRelease.body,
        createdAt: new Date(mockRelease.created_at),
        releasedAt: new Date(mockRelease.published_at),
        slackMessage: {
          text: "🎨 ComfyUI_frontend <https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0|Release v1.0.0> is stable!",
          channel: "test-channel-id",
          url: "https://slack.com/message/123",
        },
      });

      // Second call after update
      collection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockRelease.html_url,
        version: mockRelease.tag_name,
        status: "stable",
        isStable: true,
        releaseNotes: mockRelease.body,
        slackMessage: {
          text: "🎨 ComfyUI_frontend <https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0|Release v1.0.1> is stable!\n\n*Release Notes:*\nUpdated release notes",
          channel: "test-channel-id",
          url: "https://slack.com/message/123",
        },
      });

      await runGithubFrontendReleaseNotificationTask();

      // Should update the message since text changed
      expect(upsertSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://slack.com/message/123",
          text: expect.stringContaining("v1.0.1"),
        }),
      );
    });

    it("should truncate long release notes in Slack message", async () => {
      const longReleaseNotes = "x".repeat(600); // Create a 600 character string
      const mockRelease = {
        html_url: "https://github.com/Comfy-Org/ComfyUI_frontend/releases/tag/v1.0.0",
        tag_name: "v1.0.0",
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        body: longReleaseNotes,
      };

      mockGh.repos = {
        listReleases: mock(() =>
          Promise.resolve({
            data: [mockRelease],
          }),
        ),
      } as any;

      // First call - save initial data
      collection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockRelease.html_url,
        version: mockRelease.tag_name,
        status: "stable",
        isStable: true,
        releaseNotes: longReleaseNotes,
        createdAt: new Date(mockRelease.created_at),
        releasedAt: new Date(mockRelease.published_at),
      });

      // Second call - save with truncated message
      collection.findOneAndUpdate.mockResolvedValueOnce({
        url: mockRelease.html_url,
        version: mockRelease.tag_name,
        status: "stable",
        isStable: true,
        releaseNotes: longReleaseNotes,
        slackMessage: {
          text: expect.stringContaining("... <"),
          channel: "test-channel-id",
          url: "https://slack.com/message/123",
        },
      });

      await runGithubFrontendReleaseNotificationTask();

      // Check that the message was truncated and includes a "Read more" link
      expect(upsertSlackMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/\.\.\. <.*\|Read more>/),
        }),
      );
    });
  });

  describe("Database Index", () => {
    it("should create unique index on url field", async () => {
      expect(collection.createIndex).toHaveBeenCalledWith({ url: 1 }, { unique: true });
    });
  });
});
