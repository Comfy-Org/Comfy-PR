import { describe, test, expect, afterEach } from "bun:test";
import { downloadAvatar, setSlackBotAvatar } from "./avatar";
import { existsSync } from "fs";
import { unlink } from "fs/promises";
import { http, HttpResponse } from "msw";
import { server } from "@/src/test/msw-setup";

describe("avatar", () => {
  let downloadedFiles: string[] = [];

  afterEach(async () => {
    // Clean up any downloaded files
    for (const file of downloadedFiles) {
      if (existsSync(file)) {
        await unlink(file);
      }
    }
    downloadedFiles = [];
  });

  describe("downloadAvatar", () => {
    test("should download avatar from URL", async () => {
      const testUrl = "https://avatars.githubusercontent.com/u/172744619?v=4&size=64";

      // Mock the GitHub avatar endpoint
      server.use(
        http.get("https://avatars.githubusercontent.com/u/172744619", () => {
          // Return a simple 1x1 PNG image
          const pngBuffer = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "base64",
          );
          return HttpResponse.arrayBuffer(pngBuffer, {
            headers: {
              "Content-Type": "image/png",
            },
          });
        }),
      );

      const filePath = await downloadAvatar(testUrl);
      downloadedFiles.push(filePath);

      expect(filePath).toBeTruthy();
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toContain("slack-avatar-");
    });

    test("should throw error for invalid URL", async () => {
      const invalidUrl = "https://invalid-url-that-does-not-exist.example.com/avatar.jpg";

      // Mock the invalid URL to return 404
      server.use(
        http.get("https://invalid-url-that-does-not-exist.example.com/avatar.jpg", () => {
          return HttpResponse.json({ error: "Not found" }, { status: 404 });
        }),
      );

      await expect(downloadAvatar(invalidUrl)).rejects.toThrow();
    });
  });

  describe("setSlackBotAvatar", () => {
    test("should handle missing image file", async () => {
      const nonExistentPath = "/tmp/non-existent-avatar-12345.jpg";

      // Note: This test validates file handling error, not Slack API errors
      // The error is thrown when trying to read the non-existent file
      await expect(setSlackBotAvatar(nonExistentPath)).rejects.toThrow();
    });

    // Note: Testing the Slack API upload requires either:
    // 1. A valid SLACK_BOT_TOKEN environment variable (skipped in CI)
    // 2. More complex mocking of the Slack WebClient internals
    // For now, we've validated the download functionality and error handling
  });
});
