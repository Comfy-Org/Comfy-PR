import { gh } from "@/src/gh";
import { getSlackChannel } from "@/src/slack/channels";
import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { upsertSlackMessage } from "../gh-desktop-release-notification/upsertSlackMessage";

jest.mock("@/src/gh");
jest.mock("@/src/slack/channels");
jest.mock("../gh-desktop-release-notification/upsertSlackMessage");

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

import runGithubCoreTagNotificationTask from "./index";

describe("GithubCoreTagNotificationTask", () => {
  const mockGh = gh as jest.Mocked<typeof gh>;
  const mockGetSlackChannel = getSlackChannel as jest.MockedFunction<typeof getSlackChannel>;
  const mockUpsertSlackMessage = upsertSlackMessage as jest.MockedFunction<typeof upsertSlackMessage>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.findOneAndUpdate.mockImplementation((_filter, update) => Promise.resolve(update.$set));
    mockGetSlackChannel.mockImplementation((channelName: string) =>
      Promise.resolve({
        id: channelName === "desktop" ? "test-channel-desktop" : "test-channel-live-ops",
        name: channelName,
      } as any),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch tags from the ComfyUI repository", async () => {
    const mockTags = [
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

    mockGh.repos = {
      listTags: jest.fn().mockResolvedValue({ data: mockTags }),
      getCommit: jest.fn().mockResolvedValue({
        data: {
          commit: {
            author: { date: new Date().toISOString() },
            committer: { date: new Date().toISOString() },
          },
        },
      }),
    } as any;

    mockGh.git = {
      getTag: jest.fn().mockRejectedValue(new Error("Not an annotated tag")),
    } as any;

    mockUpsertSlackMessage.mockResolvedValue({
      text: "Test message",
      channel: "test-channel-id",
      url: "https://slack.com/message/123",
    });

    await runGithubCoreTagNotificationTask();

    expect(mockGh.repos.listTags).toHaveBeenCalledWith({
      owner: "comfyanonymous",
      repo: "ComfyUI",
      per_page: 10,
    });
  });

  it("should save new tags to the database", async () => {
    const mockTags = [
      {
        name: "v0.2.2",
        commit: {
          sha: "def789ghi012",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/def789ghi012",
        },
      },
    ];

    mockGh.repos = {
      listTags: jest.fn().mockResolvedValue({ data: mockTags }),
      getCommit: jest.fn().mockResolvedValue({
        data: {
          commit: {
            author: { date: new Date().toISOString() },
          },
        },
      }),
    } as any;

    mockGh.git = {
      getTag: jest.fn().mockResolvedValue({
        data: {
          tag: "v0.2.2",
          tagger: {
            date: new Date().toISOString(),
            name: "Test Author",
            email: "test@example.com",
          },
          message: "Release v0.2.2 with new features",
        },
      }),
    } as any;

    mockUpsertSlackMessage.mockResolvedValue({
      text: "Test message",
      channel: "test-channel-id",
      url: "https://slack.com/message/456",
    });

    await runGithubCoreTagNotificationTask();

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalled();
  });

  it("should send Slack notifications for new tags to multiple channels", async () => {
    const mockTags = [
      {
        name: "v0.2.3",
        commit: {
          sha: "123abc456def",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/123abc456def",
        },
      },
    ];

    mockGh.repos = {
      listTags: jest.fn().mockResolvedValue({ data: mockTags }),
      getCommit: jest.fn().mockResolvedValue({
        data: {
          commit: {
            author: { date: new Date().toISOString() },
          },
        },
      }),
    } as any;

    mockGh.git = {
      getTag: jest.fn().mockRejectedValue(new Error("Not an annotated tag")),
    } as any;

    mockUpsertSlackMessage.mockResolvedValue({
      text: "🏷️ ComfyUI <https://github.com/comfyanonymous/ComfyUI/releases/tag/v0.2.3|Tag v0.2.3> created!",
      channel: "test-channel-desktop",
      url: "https://slack.com/message/789",
    });

    await runGithubCoreTagNotificationTask();

    // Should be called twice - once for each channel
    expect(mockUpsertSlackMessage).toHaveBeenCalledTimes(2);
    expect(mockUpsertSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "test-channel-desktop",
        text: expect.stringContaining("v0.2.3"),
      }),
    );
    expect(mockUpsertSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "test-channel-live-ops",
        text: expect.stringContaining("v0.2.3"),
      }),
    );
  });

  it("should not send duplicate notifications for existing tags", async () => {
    const mockTags = [
      {
        name: "v0.2.0",
        commit: {
          sha: "existing123",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/existing123",
        },
      },
    ];

    mockGh.repos = {
      listTags: jest.fn().mockResolvedValue({ data: mockTags }),
    } as any;

    mockCollection.findOne.mockResolvedValue({
      tagName: "v0.2.0",
      commitSha: "existing123",
      url: "https://github.com/comfyanonymous/ComfyUI/releases/tag/v0.2.0",
      slackMessages: [
        {
          text: "Already sent",
          channel: "test-channel-desktop",
          url: "https://slack.com/message/old1",
        },
        {
          text: "Already sent",
          channel: "test-channel-live-ops",
          url: "https://slack.com/message/old2",
        },
      ],
    });

    await runGithubCoreTagNotificationTask();

    expect(mockUpsertSlackMessage).not.toHaveBeenCalled();
  });

  it("should handle annotated tags with messages", async () => {
    const mockTags = [
      {
        name: "v0.3.0",
        commit: {
          sha: "annotated123",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/annotated123",
        },
      },
    ];

    const tagMessage = "Major release with breaking changes";

    mockGh.repos = {
      listTags: jest.fn().mockResolvedValue({ data: mockTags }),
    } as any;

    mockGh.git = {
      getTag: jest.fn().mockResolvedValue({
        data: {
          tag: "v0.3.0",
          tagger: {
            date: new Date().toISOString(),
            name: "Test Author",
            email: "test@example.com",
          },
          message: tagMessage,
        },
      }),
    } as any;

    mockUpsertSlackMessage.mockResolvedValue({
      text: `🏷️ ComfyUI <https://github.com/comfyanonymous/ComfyUI/releases/tag/v0.3.0|Tag v0.3.0> created!\n> ${tagMessage}`,
      channel: "test-channel-id",
      url: "https://slack.com/message/annotated",
    });

    await runGithubCoreTagNotificationTask();

    expect(mockUpsertSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(tagMessage),
      }),
    );
  });

  it("should respect sendSince configuration", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const mockTags = [
      {
        name: "v0.1.0",
        commit: {
          sha: "old123",
          url: "https://api.github.com/repos/comfyanonymous/ComfyUI/commits/old123",
        },
      },
    ];

    mockGh.repos = {
      listTags: jest.fn().mockResolvedValue({ data: mockTags }),
      getCommit: jest.fn().mockResolvedValue({
        data: {
          commit: {
            author: { date: oldDate.toISOString() },
          },
        },
      }),
    } as any;

    mockGh.git = {
      getTag: jest.fn().mockResolvedValue({
        data: {
          tag: "v0.1.0",
          tagger: {
            date: oldDate.toISOString(),
          },
        },
      }),
    } as any;

    await runGithubCoreTagNotificationTask();

    expect(mockUpsertSlackMessage).not.toHaveBeenCalled();
  });
});
