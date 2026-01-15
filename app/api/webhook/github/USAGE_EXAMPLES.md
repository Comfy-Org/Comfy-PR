# GitHub Webhook Usage Examples

## Quick Start

### 1. Check Health

```bash
curl http://localhost:3000/api/webhook/github
```

### 2. Send Test Webhook

```bash
bun app/api/webhook/github/test-webhook.ts
```

### 3. Setup Indexes

```bash
bun app/api/webhook/github/setup-indexes.ts
```

### 4. Query Events

```bash
bun app/api/webhook/github/webhook-events.ts
```

## Query Examples

### Get All Unprocessed Pull Request Events

```typescript
import { getUnprocessedEvents } from "./app/api/webhook/github/webhook-events";

const prEvents = await getUnprocessedEvents("pull_request", 50);

for (const event of prEvents) {
  const pr = event.payload.pull_request;
  console.log(`PR #${pr.number}: ${pr.title}`);
  console.log(`  Action: ${event.payload.action}`);
  console.log(`  URL: ${pr.html_url}`);
  console.log(`  Received: ${event.receivedAt.toISOString()}`);
}
```

### Get Events for a Specific Repository

```typescript
import { getRepositoryEvents } from "./app/api/webhook/github/webhook-events";

const events = await getRepositoryEvents("Comfy-Org/ComfyUI_frontend", 100);

console.log(`Found ${events.length} events for ComfyUI_frontend`);

// Group by event type
const byType = events.reduce(
  (acc, event) => {
    acc[event.eventType!] = (acc[event.eventType!] || 0) + 1;
    return acc;
  },
  {} as Record<string, number>,
);

console.log("Events by type:", byType);
```

### Get All Events for a Specific PR

```typescript
import { getPullRequestEvents } from "./app/api/webhook/github/webhook-events";

const prEvents = await getPullRequestEvents("Comfy-Org/ComfyUI_frontend", 123);

console.log(`Timeline for PR #123:`);
for (const event of prEvents.reverse()) {
  console.log(`  ${event.receivedAt.toISOString()} - ${event.eventType}: ${event.payload.action}`);
}
```

### Custom Query with Date Range

```typescript
import { queryWebhookEvents } from "./app/api/webhook/github/webhook-events";

const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

const events = await queryWebhookEvents({
  eventType: "pull_request",
  repository: "Comfy-Org/ComfyUI_frontend",
  fromDate: lastWeek,
  processed: false,
  limit: 50,
});

console.log(`Found ${events.length} unprocessed PR events from last week`);
```

### Get Statistics

```typescript
import { getWebhookStats } from "./app/api/webhook/github/webhook-events";

const stats = await getWebhookStats();

console.log(`Total events: ${stats.total}`);
console.log(`Processed: ${stats.processed}`);
console.log(`Pending: ${stats.unprocessed}`);
console.log("\nTop event types:");
stats.eventTypes.slice(0, 10).forEach((e) => {
  console.log(`  ${e.eventType}: ${e.count}`);
});
```

## Processing Examples

### Auto-Label New PRs

```typescript
import {
  getUnprocessedEvents,
  markEventAsProcessed,
} from "./app/api/webhook/github/webhook-events";
import { ghc } from "@/src/ghc";

async function autoLabelPRs() {
  const events = await getUnprocessedEvents("pull_request", 10);

  for (const event of events) {
    try {
      if (event.payload.action !== "opened") {
        await markEventAsProcessed(event.deliveryId!);
        continue;
      }

      const pr = event.payload.pull_request;
      const repo = event.payload.repository;

      const labels: string[] = [];

      // Add size labels
      if (pr.changed_files > 100) {
        labels.push("size:large");
      } else if (pr.changed_files > 20) {
        labels.push("size:medium");
      } else {
        labels.push("size:small");
      }

      // Add draft label
      if (pr.draft) {
        labels.push("draft");
      }

      // Apply labels
      if (labels.length > 0) {
        await ghc.issues.addLabels({
          owner: repo.owner.login,
          repo: repo.name,
          issue_number: pr.number,
          labels,
        });

        console.log(`Added labels to PR #${pr.number}: ${labels.join(", ")}`);
      }

      await markEventAsProcessed(event.deliveryId!);
    } catch (error) {
      console.error(`Error processing event ${event.deliveryId}:`, error);
      await markEventAsProcessed(event.deliveryId!, error.message);
    }
  }
}

await autoLabelPRs();
```

### Notify Slack on New Issues

```typescript
import {
  getUnprocessedEvents,
  markEventAsProcessed,
} from "./app/api/webhook/github/webhook-events";
import { slack } from "@/src/slack";

async function notifyNewIssues() {
  const events = await getUnprocessedEvents("issues", 10);

  for (const event of events) {
    try {
      if (event.payload.action !== "opened") {
        await markEventAsProcessed(event.deliveryId!);
        continue;
      }

      const issue = event.payload.issue;
      const repo = event.payload.repository;

      await slack.chat.postMessage({
        channel: "#github-issues",
        text: `New issue in ${repo.full_name}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*New Issue: <${issue.html_url}|#${issue.number} ${issue.title}>*\n${repo.full_name}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: issue.body?.substring(0, 500) || "No description",
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Opened by @${issue.user.login}`,
              },
            ],
          },
        ],
      });

      console.log(`Notified Slack about issue #${issue.number}`);
      await markEventAsProcessed(event.deliveryId!);
    } catch (error) {
      console.error(`Error processing event ${event.deliveryId}:`, error);
      await markEventAsProcessed(event.deliveryId!, error.message);
    }
  }
}

await notifyNewIssues();
```

### Track PR Review Status

```typescript
import { getPullRequestEvents } from "./app/api/webhook/github/webhook-events";

async function getPRReviewSummary(repo: string, prNumber: number) {
  const events = await getPullRequestEvents(repo, prNumber);

  const reviews = events.filter((e) => e.eventType === "pull_request_review");
  const comments = events.filter((e) => e.eventType === "pull_request_review_comment");

  const approvals = reviews.filter((e) => e.payload.review?.state === "approved");
  const changes = reviews.filter((e) => e.payload.review?.state === "changes_requested");

  console.log(`PR #${prNumber} Review Summary:`);
  console.log(`  Total reviews: ${reviews.length}`);
  console.log(`  Approvals: ${approvals.length}`);
  console.log(`  Changes requested: ${changes.length}`);
  console.log(`  Review comments: ${comments.length}`);

  return {
    reviews: reviews.length,
    approvals: approvals.length,
    changesRequested: changes.length,
    comments: comments.length,
  };
}

const summary = await getPRReviewSummary("Comfy-Org/ComfyUI_frontend", 123);
```

### Monitor Repository Activity

```typescript
import { getRepositoryEvents } from "./app/api/webhook/github/webhook-events";

async function getRepoActivityReport(repo: string, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await getRepositoryEvents(repo, 1000);
  const recentEvents = events.filter((e) => e.receivedAt >= since);

  const activity = {
    pushes: recentEvents.filter((e) => e.eventType === "push").length,
    prs: recentEvents.filter((e) => e.eventType === "pull_request").length,
    issues: recentEvents.filter((e) => e.eventType === "issues").length,
    releases: recentEvents.filter((e) => e.eventType === "release").length,
    stars: recentEvents.filter((e) => e.eventType === "star").length,
    forks: recentEvents.filter((e) => e.eventType === "fork").length,
  };

  console.log(`Activity report for ${repo} (last ${days} days):`);
  console.log(`  Pushes: ${activity.pushes}`);
  console.log(`  Pull Requests: ${activity.prs}`);
  console.log(`  Issues: ${activity.issues}`);
  console.log(`  Releases: ${activity.releases}`);
  console.log(`  Stars: ${activity.stars}`);
  console.log(`  Forks: ${activity.forks}`);

  return activity;
}

await getRepoActivityReport("Comfy-Org/ComfyUI_frontend", 7);
```

## Direct MongoDB Queries

### Find Specific Event Types

```typescript
import { db } from "@/src/db";

const collection = db.collection("GithubWebhookEvents");

// Find all merged PRs
const mergedPRs = await collection
  .find({
    eventType: "pull_request",
    "payload.action": "closed",
    "payload.pull_request.merged": true,
  })
  .sort({ receivedAt: -1 })
  .limit(10)
  .toArray();

console.log(`Recent merged PRs: ${mergedPRs.length}`);
```

### Aggregate Statistics

```typescript
import { db } from "@/src/db";

const collection = db.collection("GithubWebhookEvents");

// Count events per repository
const repoStats = await collection
  .aggregate([
    { $match: { "payload.repository.full_name": { $exists: true } } },
    {
      $group: {
        _id: "$payload.repository.full_name",
        count: { $sum: 1 },
        events: { $push: "$eventType" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ])
  .toArray();

console.log("Top repositories by webhook events:");
repoStats.forEach((stat) => {
  console.log(`  ${stat._id}: ${stat.count} events`);
});
```

### Find Events by User

```typescript
import { db } from "@/src/db";

const collection = db.collection("GithubWebhookEvents");

// Find all events from a specific user
const userEvents = await collection
  .find({
    $or: [
      { "payload.sender.login": "username" },
      { "payload.pull_request.user.login": "username" },
      { "payload.issue.user.login": "username" },
    ],
  })
  .sort({ receivedAt: -1 })
  .toArray();

console.log(`Found ${userEvents.length} events from user`);
```

## Maintenance Tasks

### Cleanup Old Processed Events

```typescript
import { deleteOldEvents } from "./app/api/webhook/github/webhook-events";

// Delete processed events older than 30 days
const deleted = await deleteOldEvents(30);
console.log(`Deleted ${deleted} old events`);
```

### Re-process Failed Events

```typescript
import { db } from "@/src/db";

const collection = db.collection("GithubWebhookEvents");

// Find events with processing errors
const failedEvents = await collection
  .find({
    processed: true,
    processingError: { $exists: true },
  })
  .toArray();

console.log(`Found ${failedEvents.length} failed events`);

// Reset them for reprocessing
for (const event of failedEvents) {
  await collection.updateOne(
    { _id: event._id },
    {
      $set: { processed: false },
      $unset: { processingError: "", processedAt: "" },
    },
  );
}

console.log(`Reset ${failedEvents.length} events for reprocessing`);
```

### Export Events to JSON

```typescript
import { queryWebhookEvents } from "./app/api/webhook/github/webhook-events";
import { writeFileSync } from "fs";

const events = await queryWebhookEvents({
  eventType: "pull_request",
  repository: "Comfy-Org/ComfyUI_frontend",
  limit: 1000,
});

const exportData = events.map((e) => ({
  eventType: e.eventType,
  action: e.payload.action,
  number: e.payload.pull_request?.number || e.payload.issue?.number,
  title: e.payload.pull_request?.title || e.payload.issue?.title,
  user: e.payload.sender?.login,
  receivedAt: e.receivedAt,
}));

writeFileSync("webhook-events.json", JSON.stringify(exportData, null, 2));
console.log(`Exported ${exportData.length} events to webhook-events.json`);
```

## Cron Job Examples

### Daily Cleanup Task

```typescript
#!/usr/bin/env bun
import { deleteOldEvents, getWebhookStats } from "./app/api/webhook/github/webhook-events";

async function dailyCleanup() {
  console.log("Starting daily cleanup...");

  const statsBefore = await getWebhookStats();
  console.log(`Events before cleanup: ${statsBefore.total}`);

  const deleted = await deleteOldEvents(30);
  console.log(`Deleted ${deleted} old events`);

  const statsAfter = await getWebhookStats();
  console.log(`Events after cleanup: ${statsAfter.total}`);
}

if (import.meta.main) {
  await dailyCleanup();
}
```

### Hourly Event Processor

```typescript
#!/usr/bin/env bun
import {
  getUnprocessedEvents,
  markEventAsProcessed,
} from "./app/api/webhook/github/webhook-events";

async function processEvents() {
  const events = await getUnprocessedEvents(undefined, 100);

  console.log(`Processing ${events.length} unprocessed events...`);

  for (const event of events) {
    try {
      // Your processing logic here
      console.log(`Processing ${event.eventType} event ${event.deliveryId}`);

      await markEventAsProcessed(event.deliveryId!);
    } catch (error) {
      console.error(`Error processing ${event.deliveryId}:`, error);
      await markEventAsProcessed(event.deliveryId!, error.message);
    }
  }

  console.log("Processing complete");
}

if (import.meta.main) {
  await processEvents();
}
```
