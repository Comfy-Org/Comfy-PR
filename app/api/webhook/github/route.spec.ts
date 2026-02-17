import { db } from "@/src/db";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHmac } from "crypto";
import { GET, POST } from "./route";
import { NextRequest } from "next/server";

// Mock environment
const TEST_SECRET = "test-webhook-secret-key";
process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;

describe("GitHub Webhook Route", () => {
  const testCollection = "GithubWebhookEvents_test";

  beforeEach(async () => {
    // Clean up test collection
    await db.collection(testCollection).deleteMany({});
  });

  afterEach(async () => {
    // Clean up after tests
    await db.collection(testCollection).deleteMany({});
  });

  describe("POST /api/webhook/github", () => {
    it("should store a valid webhook event", async () => {
      const payload = {
        action: "opened",
        number: 1,
        pull_request: {
          id: 1,
          title: "Test PR",
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = "sha256=" + createHmac("sha256", TEST_SECRET).update(rawBody).digest("hex");

      const request = new Request("http://localhost:3000/api/webhook/github", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "pull_request",
          "x-github-delivery": "12345-67890",
          "x-github-hook-id": "123456",
          "x-hub-signature-256": signature,
          "user-agent": "GitHub-Hookshot/test",
        },
        body: rawBody,
      });

      const response = await POST(request as unknown as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.eventType).toBe("pull_request");
      expect(data.deliveryId).toBe("12345-67890");
      expect(data.eventId).toBeDefined();
    });

    it("should reject webhook with invalid signature", async () => {
      const payload = { action: "opened" };
      const rawBody = JSON.stringify(payload);

      const request = new Request("http://localhost:3000/api/webhook/github", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "push",
          "x-github-delivery": "invalid-delivery",
          "x-hub-signature-256": "sha256=invalidsignature",
        },
        body: rawBody,
      });

      const response = await POST(request as unknown as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Invalid signature");
    });

    it("should reject invalid JSON payload", async () => {
      const rawBody = "not valid json{";
      const signature = "sha256=" + createHmac("sha256", TEST_SECRET).update(rawBody).digest("hex");

      const request = new Request("http://localhost:3000/api/webhook/github", {
        method: "POST",
        headers: {
          "x-github-event": "push",
          "x-hub-signature-256": signature,
        },
        body: rawBody,
      });

      const response = await POST(request as unknown as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid JSON payload");
    });

    it("should store all webhook metadata", async () => {
      const payload = { action: "created", ref: "refs/heads/main" };
      const rawBody = JSON.stringify(payload);
      const signature = "sha256=" + createHmac("sha256", TEST_SECRET).update(rawBody).digest("hex");

      const request = new Request("http://localhost:3000/api/webhook/github", {
        method: "POST",
        headers: {
          "x-github-event": "push",
          "x-github-delivery": "test-delivery-123",
          "x-github-hook-id": "hook-456",
          "x-github-hook-installation-target-id": "789",
          "x-github-hook-installation-target-type": "repository",
          "x-hub-signature-256": signature,
          "user-agent": "GitHub-Hookshot/v1.2.3",
        },
        body: rawBody,
      });

      const response = await POST(request as unknown as NextRequest);
      await response.json();

      expect(response.status).toBe(200);

      // Verify stored document
      const collection = db.collection("GithubWebhookEvents");
      const stored = await collection.findOne({ deliveryId: "test-delivery-123" });

      expect(stored).toBeDefined();
      expect(stored?.eventType).toBe("push");
      expect(stored?.hookId).toBe("hook-456");
      expect(stored?.hookInstallationTargetId).toBe("789");
      expect(stored?.hookInstallationTargetType).toBe("repository");
      expect(stored?.payload).toEqual(payload);
      expect(stored?.userAgent).toBe("GitHub-Hookshot/v1.2.3");
      expect(stored?.processed).toBe(false);
      expect(stored?.receivedAt).toBeInstanceOf(Date);

      // Cleanup
      await collection.deleteOne({ _id: stored._id });
    });

    it("should handle multiple concurrent webhook requests", async () => {
      const requests = Array.from({ length: 5 }, (_, i) => {
        const payload = { action: "test", number: i };
        const rawBody = JSON.stringify(payload);
        const signature =
          "sha256=" + createHmac("sha256", TEST_SECRET).update(rawBody).digest("hex");

        return new Request("http://localhost:3000/api/webhook/github", {
          method: "POST",
          headers: {
            "x-github-event": "test",
            "x-github-delivery": `delivery-${i}`,
            "x-hub-signature-256": signature,
          },
          body: rawBody,
        });
      });

      const responses = await Promise.all(
        requests.map((req) => POST(req as unknown as NextRequest)),
      );

      expect(responses.every((r) => r.status === 200)).toBe(true);

      const collection = db.collection("GithubWebhookEvents");
      const count = await collection.countDocuments({
        deliveryId: { $in: requests.map((_, i) => `delivery-${i}`) },
      });

      expect(count).toBe(5);

      // Cleanup
      await collection.deleteMany({
        deliveryId: { $in: requests.map((_, i) => `delivery-${i}`) },
      });
    });

    it("should allow webhooks without signature if secret not configured", async () => {
      const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
      delete process.env.GITHUB_WEBHOOK_SECRET;

      const payload = { action: "test" };
      const rawBody = JSON.stringify(payload);

      const request = new Request("http://localhost:3000/api/webhook/github", {
        method: "POST",
        headers: {
          "x-github-event": "test",
          "x-github-delivery": "no-secret-test",
        },
        body: rawBody,
      });

      const response = await POST(request as unknown as NextRequest);
      expect(response.status).toBe(200);

      // Cleanup
      const collection = db.collection("GithubWebhookEvents");
      await collection.deleteOne({ deliveryId: "no-secret-test" });

      // Restore
      process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
    });
  });

  describe("GET /api/webhook/github", () => {
    it("should return health check status", async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.message).toBe("GitHub webhook endpoint is ready");
      expect(typeof data.eventsStored).toBe("number");
    });
  });
});
