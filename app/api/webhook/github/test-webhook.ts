#!/usr/bin/env bun
/**
 * Test script to simulate a GitHub webhook event
 * Usage: bun app/api/webhook/github/test-webhook.ts
 */
import { createHmac } from "crypto";

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/webhook/github";
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "test-webhook-secret-key";

// Sample pull request event payload
const payload = {
  action: "opened",
  number: 123,
  pull_request: {
    id: 1,
    node_id: "PR_kwDOABCDE123",
    number: 123,
    title: "Test Pull Request",
    user: {
      login: "testuser",
      id: 1,
    },
    body: "This is a test PR",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    html_url: "https://github.com/Comfy-Org/test-repo/pull/123",
    state: "open",
    draft: false,
  },
  repository: {
    id: 1,
    name: "test-repo",
    full_name: "Comfy-Org/test-repo",
    owner: {
      login: "Comfy-Org",
      id: 1,
    },
    html_url: "https://github.com/Comfy-Org/test-repo",
  },
  sender: {
    login: "testuser",
    id: 1,
  },
};

async function sendTestWebhook() {
  const rawBody = JSON.stringify(payload);

  // Generate signature
  const signature = "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

  console.log("Sending test webhook to:", WEBHOOK_URL);
  console.log("Event type: pull_request");
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("\nSignature:", signature);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "pull_request",
        "x-github-delivery": `test-${Date.now()}`,
        "x-github-hook-id": "123456",
        "x-github-hook-installation-target-id": "789",
        "x-github-hook-installation-target-type": "repository",
        "x-hub-signature-256": signature,
        "user-agent": "GitHub-Hookshot/test",
      },
      body: rawBody,
    });

    const data = await response.json();

    console.log("\nResponse status:", response.status);
    console.log("Response data:", JSON.stringify(data, null, 2));

    if (response.status === 200) {
      console.log("\n✅ Webhook successfully received and stored!");
    } else {
      console.log("\n❌ Webhook failed:", data.error);
    }
  } catch (error) {
    console.error("\n❌ Error sending webhook:", error);
  }
}

// Test health check endpoint
async function testHealthCheck() {
  console.log("\n--- Testing Health Check ---");
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "GET",
    });

    const data = await response.json();
    console.log("Health check response:", JSON.stringify(data, null, 2));

    if (response.status === 200) {
      console.log("✅ Health check passed!");
    }
  } catch (error) {
    console.error("❌ Health check failed:", error);
  }
}

if (import.meta.main) {
  console.log("=== GitHub Webhook Test Script ===\n");

  // First test health check
  await testHealthCheck();

  console.log("\n--- Sending Test Webhook ---");
  await sendTestWebhook();

  // Test health check again to see updated count
  await testHealthCheck();
}
