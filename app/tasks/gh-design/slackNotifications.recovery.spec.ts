import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/slack", () => ({
  getSlack: () => ({
    search: {
      messages: async () => ({
        ok: false,
        error: "missing_scope",
      }),
    },
  }),
}));

mock.module("@/lib/slack/channels", () => ({
  getSlackChannel: async () => ({
    id: "C0A4FRL1JN9",
  }),
}));

const { findLatestDesignSlackRootMessage } = await import("./slackNotifications");

describe("gh-design Slack recovery", () => {
  it("treats Slack search failures as best-effort recovery misses", async () => {
    await expect(
      findLatestDesignSlackRootMessage({
        channelName: "product-design",
        githubUrl: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592",
      }),
    ).resolves.toBeUndefined();
  });
});
