import { describe, expect, it } from "bun:test";
import {
  buildDesignCommentActivitySlackText,
  buildDesignRootSlackText,
  planDesignCommentNotification,
  selectLatestDesignSlackRootMessage,
} from "./slackNotifications";

describe("gh-design Slack notifications", () => {
  it("builds a stable root Slack message without comment counts", () => {
    expect(
      buildDesignRootSlackText({
        url: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592",
        title: "fix: virtualize cloud job queue history list",
        user: "benceruleanlu",
        state: "open",
        type: "pull_request",
      }),
    ).toBe(
      "🎨 *New Design pull_request*: OPEN <https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592|fix: virtualize cloud job queue history list> by <https://github.com/benceruleanlu|@benceruleanlu>",
    );
  });

  it("formats threaded activity replies with the updated comment count", () => {
    expect(
      buildDesignCommentActivitySlackText(
        {
          url: "https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592",
          title: "fix: virtualize cloud job queue history list",
          type: "pull_request",
        },
        7,
        8,
      ),
    ).toBe(
      "💬 Design PR discussion updated: <https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592|fix: virtualize cloud job queue history list> now has 8 comments (+1).",
    );
  });

  it("uses the current comment count as the initial baseline without posting a reply", () => {
    expect(planDesignCommentNotification(undefined, 8)).toEqual({
      shouldReplyInThread: false,
      nextNotifiedComments: 8,
    });
  });

  it("posts a threaded reply when the comment count increases", () => {
    expect(planDesignCommentNotification(7, 8)).toEqual({
      shouldReplyInThread: true,
      nextNotifiedComments: 8,
    });
  });

  it("selects the latest matching root message in the intended channel", () => {
    const match = selectLatestDesignSlackRootMessage(
      [
        {
          channel: { id: "C0A4FRL1JN9" },
          permalink: "https://example.com/older",
          text: "🎨 *New Design pull_request*: OPEN <https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592|x>",
          ts: "1774887343.035129",
        },
        {
          channel: { id: "C0A4FRL1JN9" },
          permalink: "https://example.com/latest",
          text: "🎨 *New Design pull_request*: OPEN <https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592|x>",
          ts: "1774894802.402049",
        },
        {
          channel: { id: "COTHER" },
          permalink: "https://example.com/wrong-channel",
          text: "🎨 *New Design pull_request*: OPEN <https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592|x>",
          ts: "1774994802.402049",
        },
      ],
      "C0A4FRL1JN9",
      "https://github.com/Comfy-Org/ComfyUI_frontend/pull/10592",
    );

    expect(match?.permalink).toBe("https://example.com/latest");
  });
});
