#!/usr/bin/env bun
import { db } from "@/src/db";

/**
 * Setup MongoDB indexes for GithubWebhookEvents collection
 * Run this script once to create optimal indexes for webhook event queries
 *
 * Usage: bun app/api/webhook/github/setup-indexes.ts
 */
export async function setupWebhookIndexes() {
  const collection = db.collection("GithubWebhookEvents");

  console.log("Creating indexes for GithubWebhookEvents collection...");

  // Index for deliveryId (unique webhook deliveries)
  await collection.createIndex(
    { deliveryId: 1 },
    {
      name: "idx_deliveryId",
      unique: true,
      background: true,
    },
  );
  console.log("✓ Created index: deliveryId");

  // Index for eventType (query by event type)
  await collection.createIndex(
    { eventType: 1 },
    {
      name: "idx_eventType",
      background: true,
    },
  );
  console.log("✓ Created index: eventType");

  // Index for receivedAt (query by time range)
  await collection.createIndex(
    { receivedAt: -1 },
    {
      name: "idx_receivedAt",
      background: true,
    },
  );
  console.log("✓ Created index: receivedAt (descending)");

  // Index for processed status (query unprocessed events)
  await collection.createIndex(
    { processed: 1 },
    {
      name: "idx_processed",
      background: true,
    },
  );
  console.log("✓ Created index: processed");

  // Compound index for event type + processed status + time
  await collection.createIndex(
    { eventType: 1, processed: 1, receivedAt: -1 },
    {
      name: "idx_eventType_processed_receivedAt",
      background: true,
    },
  );
  console.log("✓ Created compound index: eventType + processed + receivedAt");

  // Index for repository events (common query pattern)
  await collection.createIndex(
    { "payload.repository.full_name": 1, receivedAt: -1 },
    {
      name: "idx_repo_fullname_receivedAt",
      background: true,
      sparse: true, // Only index documents that have this field
    },
  );
  console.log("✓ Created index: payload.repository.full_name + receivedAt");

  // Index for pull request events
  await collection.createIndex(
    { "payload.pull_request.number": 1, "payload.repository.full_name": 1 },
    {
      name: "idx_pr_number_repo",
      background: true,
      sparse: true,
    },
  );
  console.log("✓ Created index: payload.pull_request.number + repo");

  // Index for issue events
  await collection.createIndex(
    { "payload.issue.number": 1, "payload.repository.full_name": 1 },
    {
      name: "idx_issue_number_repo",
      background: true,
      sparse: true,
    },
  );
  console.log("✓ Created index: payload.issue.number + repo");

  console.log("\nAll indexes created successfully!");

  // List all indexes
  const indexes = await collection.listIndexes().toArray();
  console.log("\nCurrent indexes:");
  indexes.forEach((idx) => {
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
  });

  return indexes;
}

// Run if executed directly
if (import.meta.main) {
  await setupWebhookIndexes();
  await db.close();
}
