import { describe, expect, it, jest } from "bun:test";
import { safeSlackPostMessage, safeSlackUpdateMessage } from "./safeSlackMessage";

// Type definition for mocked Slack client
type MockSlackClient = {
  chat: {
    postMessage: jest.Mock;
    update?: jest.Mock;
  };
};

describe("safeSlackMessage", () => {
  describe("safeSlackPostMessage", () => {
    it("should post message without truncation for short text", async () => {
      const mockSlack = {
        chat: {
          postMessage: jest.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
        },
      } as MockSlackClient;

      const params = {
        channel: "C123",
        text: "Short message",
        blocks: [{ type: "markdown", text: "Short message" }],
      };

      await safeSlackPostMessage(mockSlack, params);

      expect(mockSlack.chat.postMessage).toHaveBeenCalledWith(params);
    });

    it("should truncate long text from the middle", async () => {
      const mockSlack = {
        chat: {
          postMessage: jest.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
        },
      } as MockSlackClient;

      const longText = "A".repeat(40000);
      const params = {
        channel: "C123",
        text: longText,
      };

      await safeSlackPostMessage(mockSlack, params);

      const calledParams = mockSlack.chat.postMessage.mock.calls[0][0];
      expect(calledParams.text).toContain("...TRUNCATED...");
      expect(calledParams.text.length).toBeLessThan(longText.length);
      expect(calledParams.text).toMatch(/^A+\n\n\.\.\.TRUNCATED\.\.\.\n\nA+$/);
    });

    it("should truncate long markdown blocks", async () => {
      const mockSlack = {
        chat: {
          postMessage: jest.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
        },
      } as MockSlackClient;

      const longText = "B".repeat(15000);
      const params = {
        channel: "C123",
        blocks: [{ type: "markdown", text: longText }],
      };

      await safeSlackPostMessage(mockSlack, params);

      const calledParams = mockSlack.chat.postMessage.mock.calls[0][0];
      expect(calledParams.blocks[0].text).toContain("...TRUNCATED...");
      expect(calledParams.blocks[0].text.length).toBeLessThan(longText.length);
    });

    it("should retry with aggressive truncation on msg_too_long error", async () => {
      const mockSlack = {
        chat: {
          postMessage: jest
            .fn()
            .mockRejectedValueOnce({
              data: { error: "msg_too_long", ok: false },
              code: "slack_webapi_platform_error",
            })
            .mockResolvedValueOnce({ ok: true, ts: "1234567890.123456" }),
        },
      } as MockSlackClient;

      const params = {
        channel: "C123",
        text: "Some text",
        blocks: [{ type: "markdown", text: "Some text" }],
      };

      await safeSlackPostMessage(mockSlack, params);

      expect(mockSlack.chat.postMessage).toHaveBeenCalledTimes(2);
    });

    it("should preserve non-markdown blocks", async () => {
      const mockSlack = {
        chat: {
          postMessage: jest.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
        },
      } as MockSlackClient;

      const params = {
        channel: "C123",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: "Section text" } },
          { type: "divider" },
        ],
      };

      await safeSlackPostMessage(mockSlack, params);

      const calledParams = mockSlack.chat.postMessage.mock.calls[0][0];
      expect(calledParams.blocks).toEqual(params.blocks);
    });
  });

  describe("safeSlackUpdateMessage", () => {
    it("should update message without truncation for short text", async () => {
      const mockSlack = {
        chat: {
          update: jest.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
        },
      } as MockSlackClient;

      const params = {
        channel: "C123",
        ts: "1234567890.123456",
        text: "Updated message",
        blocks: [{ type: "markdown", text: "Updated message" }],
      };

      await safeSlackUpdateMessage(mockSlack, params);

      expect(mockSlack.chat.update).toHaveBeenCalledWith(params);
    });

    it("should retry with aggressive truncation on msg_too_long error", async () => {
      const mockSlack = {
        chat: {
          update: jest
            .fn()
            .mockRejectedValueOnce({
              data: { error: "msg_too_long", ok: false },
              code: "slack_webapi_platform_error",
            })
            .mockResolvedValueOnce({ ok: true, ts: "1234567890.123456" }),
        },
      } as MockSlackClient;

      const params = {
        channel: "C123",
        ts: "1234567890.123456",
        text: "Some text",
        blocks: [{ type: "markdown", text: "Some text" }],
      };

      await safeSlackUpdateMessage(mockSlack, params);

      expect(mockSlack.chat.update).toHaveBeenCalledTimes(2);
    });
  });
});
