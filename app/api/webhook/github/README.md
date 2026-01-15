# GitHub Webhook Handler

This directory contains the GitHub webhook endpoint that receives and stores all GitHub events to MongoDB.

## Overview

The webhook handler:

- ✅ Receives GitHub webhook events via POST requests
- ✅ Verifies webhook signatures for security
- ✅ Stores all events to MongoDB collection `GithubWebhookEvents`
- ✅ Provides health check endpoint
- ✅ Includes comprehensive test suite
- ✅ Optimized MongoDB indexes for efficient queries
- ✅ Helper utilities for querying events

## Files

- **`route.ts`** - Main webhook handler (POST & GET endpoints)
- **`route.spec.ts`** - Comprehensive test suite
- **`setup-indexes.ts`** - Script to create MongoDB indexes
- **`webhook-events.ts`** - Helper utilities for querying webhook events
- **`README.md`** - This documentation

## Setup

### 1. Environment Variables

Add to your `.env` file:

```bash
# MongoDB connection (already configured)
MONGODB_URI=mongodb://localhost:27017/comfy-pr

# GitHub Webhook Secret (optional but recommended)
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here
```

### 2. Create MongoDB Indexes

Run the setup script to create optimized indexes:

```bash
bun app/api/webhook/github/setup-indexes.ts
```

This creates indexes for:

- `deliveryId` (unique)
- `eventType`
- `receivedAt`
- `processed`
- Compound indexes for common query patterns
- Repository and PR/Issue specific indexes

### 3. Configure GitHub Webhook

1. Go to your GitHub repository settings
2. Navigate to **Settings → Webhooks → Add webhook**
3. Set the **Payload URL** to: `https://your-domain.com/api/webhook/github`
4. Set **Content type** to: `application/json`
5. Set **Secret** to: your `GITHUB_WEBHOOK_SECRET` value
6. Select events to receive (or choose "Send me everything")
7. Ensure **Active** is checked
8. Click **Add webhook**

## API Endpoints

### POST /api/webhook/github

Receives GitHub webhook events and stores them to MongoDB.

**Headers:**

- `x-github-event` - Event type (e.g., "push", "pull_request", "issues")
- `x-github-delivery` - Unique delivery ID
- `x-github-hook-id` - Webhook configuration ID
- `x-hub-signature-256` - HMAC signature for verification

**Request Body:**
GitHub event payload (JSON)

**Response:**

```json
{
  "success": true,
  "eventId": "507f1f77bcf86cd799439011",
  "eventType": "pull_request",
  "deliveryId": "12345-67890"
}
```

**Error Responses:**

- `401` - Invalid signature
- `400` - Invalid JSON payload
- `500` - Internal server error

### GET /api/webhook/github

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "message": "GitHub webhook endpoint is ready",
  "eventsStored": 1234
}
```

## MongoDB Schema

### GithubWebhookEvents Collection

```typescript
{
  // GitHub webhook metadata
  eventType: string | null,           // e.g., "pull_request", "push", "issues"
  deliveryId: string | null,          // Unique delivery ID (indexed, unique)
  hookId: string | null,              // Webhook configuration ID
  hookInstallationTargetId: string | null,
  hookInstallationTargetType: string | null,

  // Payload
  payload: any,                       // Full GitHub event payload

  // Timestamps
  receivedAt: Date,                   // When the webhook was received (indexed)

  // Request metadata
  userAgent: string | null,           // GitHub-Hookshot version

  // Processing status
  processed: boolean,                 // Whether the event has been processed (indexed)
  processedAt?: Date,                 // When the event was processed
  processingError?: string            // Error message if processing failed
}
```

## Usage Examples

### Query Webhook Events

```typescript
import {
  queryWebhookEvents,
  getUnprocessedEvents,
  getRepositoryEvents,
  getPullRequestEvents,
  markEventAsProcessed,
  getWebhookStats,
} from "./app/api/webhook/github/webhook-events";

// Get unprocessed events
const unprocessed = await getUnprocessedEvents("pull_request", 50);

// Get events for a specific repository
const repoEvents = await getRepositoryEvents("Comfy-Org/ComfyUI_frontend");

// Get events for a specific PR
const prEvents = await getPullRequestEvents("Comfy-Org/ComfyUI_frontend", 123);

// Mark event as processed
await markEventAsProcessed("delivery-id-123");

// Get statistics
const stats = await getWebhookStats();
console.log(stats);
// {
//   total: 1234,
//   processed: 1000,
//   unprocessed: 234,
//   eventTypes: [
//     { eventType: "pull_request", count: 500 },
//     { eventType: "push", count: 400 },
//     ...
//   ]
// }

// Query with custom filters
const events = await queryWebhookEvents({
  eventType: "pull_request",
  processed: false,
  repository: "Comfy-Org/ComfyUI_frontend",
  fromDate: new Date("2025-01-01"),
  limit: 100,
});
```

### Direct MongoDB Queries

```typescript
import { db } from "@/src/db";

const collection = db.collection("GithubWebhookEvents");

// Find all pull request events
const prEvents = await collection
  .find({
    eventType: "pull_request",
  })
  .toArray();

// Find events from last 24 hours
const recent = await collection
  .find({
    receivedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  })
  .sort({ receivedAt: -1 })
  .toArray();

// Find unprocessed push events
const unprocessedPushes = await collection
  .find({
    eventType: "push",
    processed: false,
  })
  .toArray();
```

### Process Webhook Events

Example event processor:

```typescript
import {
  getUnprocessedEvents,
  markEventAsProcessed,
} from "./app/api/webhook/github/webhook-events";

async function processWebhookEvents() {
  const events = await getUnprocessedEvents("pull_request", 10);

  for (const event of events) {
    try {
      // Your processing logic here
      console.log(`Processing ${event.eventType} event ${event.deliveryId}`);

      // Example: Extract PR info
      const pr = event.payload.pull_request;
      console.log(`PR #${pr.number}: ${pr.title}`);

      // Mark as processed
      await markEventAsProcessed(event.deliveryId);
    } catch (error) {
      console.error(`Error processing event ${event.deliveryId}:`, error);
      // Mark as processed with error
      await markEventAsProcessed(event.deliveryId, error.message);
    }
  }
}

// Run processor
await processWebhookEvents();
```

## Testing

Run the test suite:

```bash
# Run tests
bun test app/api/webhook/github/route.spec.ts

# Run tests in watch mode
bun test --watch app/api/webhook/github/route.spec.ts
```

Test coverage includes:

- ✅ Valid webhook event storage
- ✅ Signature verification (valid & invalid)
- ✅ Invalid JSON payload handling
- ✅ Complete metadata storage
- ✅ Concurrent request handling
- ✅ Health check endpoint
- ✅ Environment without webhook secret

## Security

### Signature Verification

The webhook handler verifies GitHub's HMAC signature using SHA-256:

1. GitHub signs the payload with your `GITHUB_WEBHOOK_SECRET`
2. The handler recomputes the signature
3. Uses timing-safe comparison to prevent timing attacks
4. Rejects requests with invalid signatures (401 Unauthorized)

### Development Mode

If `GITHUB_WEBHOOK_SECRET` is not set:

- A warning is logged
- Signature verification is skipped
- All webhooks are accepted (for local testing)

**⚠️ Important:** Always set `GITHUB_WEBHOOK_SECRET` in production!

## Maintenance

### Cleanup Old Events

Delete processed events older than 30 days:

```typescript
import { deleteOldEvents } from "./app/api/webhook/github/webhook-events";

const deleted = await deleteOldEvents(30);
console.log(`Deleted ${deleted} old events`);
```

### Monitor Storage

```bash
# Get stats
bun app/api/webhook/github/webhook-events.ts

# Check collection size
bun -e "import { db } from './src/db'; console.log(await db.collection('GithubWebhookEvents').stats())"
```

## Common GitHub Event Types

- `push` - Code push
- `pull_request` - PR opened, closed, merged, etc.
- `pull_request_review` - PR review submitted
- `pull_request_review_comment` - Comment on PR review
- `issues` - Issue opened, closed, etc.
- `issue_comment` - Comment on issue or PR
- `create` - Branch or tag created
- `delete` - Branch or tag deleted
- `release` - Release published
- `star` - Repository starred
- `fork` - Repository forked

See [GitHub Webhook Events](https://docs.github.com/en/webhooks/webhook-events-and-payloads) for full list.

## Troubleshooting

### Webhook not receiving events

1. Check GitHub webhook delivery status in repository settings
2. Verify the payload URL is correct and publicly accessible
3. Check webhook secret matches between GitHub and environment variable
4. Review GitHub's recent deliveries for error messages

### Signature verification failing

1. Ensure `GITHUB_WEBHOOK_SECRET` matches GitHub webhook secret exactly
2. Check that request body is not modified before verification
3. Verify `x-hub-signature-256` header is present

### MongoDB connection issues

1. Verify `MONGODB_URI` is set correctly
2. Test connection: `bun -e "import { db } from './src/db'; console.log(await db.admin().ping())"`
3. Check MongoDB is running and accessible

### Query performance issues

1. Ensure indexes are created: `bun app/api/webhook/github/setup-indexes.ts`
2. Use indexed fields in queries (`eventType`, `processed`, `receivedAt`, etc.)
3. Add `.limit()` to prevent large result sets
4. Consider archiving or deleting old events

## Integration Examples

### Slack Notifications

```typescript
import { getUnprocessedEvents, markEventAsProcessed } from "./webhook-events";
import { slack } from "@/src/slack";

async function notifyPullRequests() {
  const events = await getUnprocessedEvents("pull_request");

  for (const event of events) {
    if (event.payload.action === "opened") {
      const pr = event.payload.pull_request;
      await slack.chat.postMessage({
        channel: "#pull-requests",
        text: `New PR: ${pr.title}\n${pr.html_url}`,
      });
    }
    await markEventAsProcessed(event.deliveryId);
  }
}
```

### Auto-labeling

```typescript
import { getUnprocessedEvents, markEventAsProcessed } from "./webhook-events";
import { ghc } from "@/src/ghc";

async function autoLabel() {
  const events = await getUnprocessedEvents("pull_request");

  for (const event of events) {
    if (event.payload.action === "opened") {
      const pr = event.payload.pull_request;

      // Add label based on file changes
      if (pr.changed_files > 100) {
        await ghc.issues.addLabels({
          owner: event.payload.repository.owner.login,
          repo: event.payload.repository.name,
          issue_number: pr.number,
          labels: ["large-pr"],
        });
      }
    }
    await markEventAsProcessed(event.deliveryId);
  }
}
```

## Related Documentation

- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [Webhook Events and Payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- [Securing Webhooks](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [MongoDB Node.js Driver](https://www.mongodb.com/docs/drivers/node/current/)
