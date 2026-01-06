import { db } from "@/src/db";
import type { Collection, Filter, WithId } from "mongodb";

/**
 * GitHub Webhook Event document structure
 */
export interface GithubWebhookEvent {
  // GitHub webhook metadata
  eventType: string | null;
  deliveryId: string | null;
  hookId: string | null;
  hookInstallationTargetId: string | null;
  hookInstallationTargetType: string | null;

  // Payload
  payload: any;

  // Timestamps
  receivedAt: Date;

  // Request metadata
  userAgent: string | null;

  // Processing status
  processed: boolean;
  processedAt?: Date;
  processingError?: string;
}

/**
 * Get the GithubWebhookEvents collection
 */
export function getWebhookEventsCollection(): Collection<GithubWebhookEvent> {
  return db.collection<GithubWebhookEvent>("GithubWebhookEvents");
}

/**
 * Query options for webhook events
 */
export interface WebhookEventQueryOptions {
  eventType?: string;
  processed?: boolean;
  repository?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  skip?: number;
}

/**
 * Query webhook events with flexible filters
 */
export async function queryWebhookEvents(
  options: WebhookEventQueryOptions = {},
): Promise<WithId<GithubWebhookEvent>[]> {
  const collection = getWebhookEventsCollection();

  const filter: Filter<GithubWebhookEvent> = {};

  if (options.eventType) {
    filter.eventType = options.eventType;
  }

  if (options.processed !== undefined) {
    filter.processed = options.processed;
  }

  if (options.repository) {
    filter["payload.repository.full_name"] = options.repository;
  }

  if (options.fromDate || options.toDate) {
    filter.receivedAt = {};
    if (options.fromDate) {
      filter.receivedAt.$gte = options.fromDate;
    }
    if (options.toDate) {
      filter.receivedAt.$lte = options.toDate;
    }
  }

  let query = collection.find(filter).sort({ receivedAt: -1 });

  if (options.skip) {
    query = query.skip(options.skip);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  return await query.toArray();
}

/**
 * Get unprocessed webhook events
 */
export async function getUnprocessedEvents(
  eventType?: string,
  limit = 100,
): Promise<WithId<GithubWebhookEvent>[]> {
  return await queryWebhookEvents({
    processed: false,
    eventType,
    limit,
  });
}

/**
 * Get webhook events for a specific repository
 */
export async function getRepositoryEvents(
  repositoryFullName: string,
  limit = 100,
): Promise<WithId<GithubWebhookEvent>[]> {
  return await queryWebhookEvents({
    repository: repositoryFullName,
    limit,
  });
}

/**
 * Get webhook events for a specific pull request
 */
export async function getPullRequestEvents(
  repositoryFullName: string,
  prNumber: number,
): Promise<WithId<GithubWebhookEvent>[]> {
  const collection = getWebhookEventsCollection();

  return await collection
    .find({
      "payload.repository.full_name": repositoryFullName,
      "payload.pull_request.number": prNumber,
    })
    .sort({ receivedAt: -1 })
    .toArray();
}

/**
 * Get webhook events for a specific issue
 */
export async function getIssueEvents(
  repositoryFullName: string,
  issueNumber: number,
): Promise<WithId<GithubWebhookEvent>[]> {
  const collection = getWebhookEventsCollection();

  return await collection
    .find({
      "payload.repository.full_name": repositoryFullName,
      "payload.issue.number": issueNumber,
    })
    .sort({ receivedAt: -1 })
    .toArray();
}

/**
 * Mark a webhook event as processed
 */
export async function markEventAsProcessed(
  deliveryId: string,
  error?: string,
): Promise<boolean> {
  const collection = getWebhookEventsCollection();

  const result = await collection.updateOne(
    { deliveryId },
    {
      $set: {
        processed: true,
        processedAt: new Date(),
        ...(error && { processingError: error }),
      },
    },
  );

  return result.modifiedCount > 0;
}

/**
 * Get webhook event statistics
 */
export async function getWebhookStats() {
  const collection = getWebhookEventsCollection();

  const [total, processed, unprocessed, eventTypeCounts] = await Promise.all([
    collection.countDocuments(),
    collection.countDocuments({ processed: true }),
    collection.countDocuments({ processed: false }),
    collection
      .aggregate([
        { $group: { _id: "$eventType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
  ]);

  return {
    total,
    processed,
    unprocessed,
    eventTypes: eventTypeCounts.map((e) => ({
      eventType: e._id,
      count: e.count,
    })),
  };
}

/**
 * Get recent webhook events (last 24 hours by default)
 */
export async function getRecentEvents(
  hoursAgo = 24,
  limit = 100,
): Promise<WithId<GithubWebhookEvent>[]> {
  const fromDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

  return await queryWebhookEvents({
    fromDate,
    limit,
  });
}

/**
 * Delete old webhook events (cleanup utility)
 */
export async function deleteOldEvents(olderThanDays: number): Promise<number> {
  const collection = getWebhookEventsCollection();

  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const result = await collection.deleteMany({
    receivedAt: { $lt: cutoffDate },
    processed: true, // Only delete processed events
  });

  return result.deletedCount;
}

// Example usage when run directly
if (import.meta.main) {
  console.log("Webhook Events Statistics:");
  const stats = await getWebhookStats();
  console.log(JSON.stringify(stats, null, 2));

  console.log("\nRecent Events (last 24h):");
  const recent = await getRecentEvents(24, 10);
  console.log(`Found ${recent.length} events`);
  recent.forEach((event) => {
    console.log(
      `  - ${event.eventType} (${event.deliveryId}) at ${event.receivedAt.toISOString()}`,
    );
  });

  await db.close();
}
