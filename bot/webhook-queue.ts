/**
 * Webhook ingest queue backed by MongoDB.
 *
 * Pipeline:
 *   incoming HTTP webhook
 *     → enqueue() inserts a document into `webhook_queue`
 *     → MongoDB changeStream pushes the new doc to a local consumer
 *     → the consumer dispatches to a per-source handler
 *     → markProcessed() flips `processed=true` so a restart-resume doesn't
 *       reprocess it
 *
 * Why a queue at all (instead of handling the webhook inline like before):
 *   - Bot restarts/crashes no longer drop in-flight webhooks; the queue
 *     retains them for 24h via a TTL index.
 *   - Multiple sources (Slack/GitHub/Notion) flow through one place, which
 *     simplifies replay, debugging, and future ingester offload.
 *   - Resume-from-_id on the changeStream means a clean restart picks up
 *     exactly where it left off with no duplicates beyond Mongo's
 *     at-least-once semantics.
 *
 * Why TTL index (not a `capped` collection):
 *   MongoDB capped collections cap on *bytes* and don't support per-doc TTL
 *   or in-place updates (which we need to flip `processed`). A regular
 *   collection + TTL index on `createdAt` gives true 24h time-cap and lets
 *   the consumer mark docs as processed.
 */
import { db } from "@/src/db";
import type { ChangeStream, ChangeStreamDocument, ObjectId } from "mongodb";

export type WebhookSource = "slack" | "github" | "notion";

export type WebhookQueueDoc = {
  _id?: ObjectId;
  source: WebhookSource;
  /** Provider-supplied event id when available, else a synthetic id.
   *  Used together with the existing `webhook-event-${eventId}` dedup in
   *  SlackBotState so changeStream resume duplicates don't re-run handlers. */
  eventId: string;
  /** Raw verified payload exactly as the provider sent it. */
  payload: unknown;
  /** Anything the receiver wants to attach (signing-cert id, retry-num,
   *  delivery uuid, etc.). */
  meta?: Record<string, unknown>;
  /** ISO clock at insert time. TTL index uses this. */
  createdAt: Date;
  /** Set true once a consumer has fully handled it. */
  processed: boolean;
  /** When `processed=true`, when it was finished. */
  processedAt?: Date;
  /** Stack trace (truncated) if a handler threw. Useful for replay. */
  error?: string;
};

const COLLECTION = "webhook_queue";
const TTL_SECONDS = 24 * 60 * 60;

let initialized = false;

/** Idempotent. Safe to call from any module that touches the queue. */
export async function ensureWebhookQueueIndexes(): Promise<void> {
  if (initialized) return;
  const col = db.collection<WebhookQueueDoc>(COLLECTION);
  await col.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: TTL_SECONDS, name: "webhook_queue_ttl_24h" },
  );
  // Speeds up replay queries (`source: "slack", processed: false`).
  await col.createIndex({ source: 1, processed: 1, createdAt: -1 });

  // Edge dedup collection (used by Vercel webhook routes to suppress retry
  // storms before the queue insert). 1h TTL since Slack stops retrying
  // long before that.
  const edge = db.collection("webhook_edge_dedup");
  await edge.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 60 * 60, name: "webhook_edge_dedup_ttl_1h" },
  );

  initialized = true;
}

/** Insert a fresh webhook into the queue. Returns the inserted _id. */
export async function enqueueWebhook(
  doc: Omit<WebhookQueueDoc, "_id" | "createdAt" | "processed">,
): Promise<ObjectId> {
  await ensureWebhookQueueIndexes();
  const col = db.collection<WebhookQueueDoc>(COLLECTION);
  const res = await col.insertOne({
    ...doc,
    createdAt: new Date(),
    processed: false,
  });
  return res.insertedId;
}

/** Mark a webhook as fully processed so restart-resume doesn't replay it. */
export async function markWebhookProcessed(id: ObjectId, error?: Error): Promise<void> {
  const col = db.collection<WebhookQueueDoc>(COLLECTION);
  await col.updateOne(
    { _id: id },
    {
      $set: {
        processed: true,
        processedAt: new Date(),
        ...(error ? { error: String(error.stack || error.message).slice(0, 4000) } : {}),
      },
    },
  );
}

export type WebhookConsumer = (doc: WebhookQueueDoc) => Promise<void>;

export type StartConsumerOptions = {
  /** Per-source dispatcher. Throwing inside is OK — the doc gets marked
   *  with the error and is *not* retried (changeStream only fires once
   *  per insert in steady-state). */
  consume: WebhookConsumer;
  /** Optional filter; default = all sources. */
  sources?: WebhookSource[];
  /** Replay any `processed=false` docs sitting in the queue at startup
   *  before tailing the changeStream. Default true. */
  drainBacklog?: boolean;
  /** Logger hooks, defaults to console.* */
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
};

/** Tails the queue and dispatches each new doc to `consume`.
 *  Call once at bot startup. Returns a stop() function. */
export async function startWebhookConsumer(
  opts: StartConsumerOptions,
): Promise<() => Promise<void>> {
  await ensureWebhookQueueIndexes();
  const log = opts.logger ?? console;
  const drainBacklog = opts.drainBacklog ?? true;
  const sources = opts.sources;
  const col = db.collection<WebhookQueueDoc>(COLLECTION);

  if (drainBacklog) {
    const filter = {
      processed: false,
      ...(sources ? { source: { $in: sources } } : {}),
    };
    const backlog = await col.find(filter).sort({ createdAt: 1 }).toArray();
    if (backlog.length) {
      log.info(`webhook-queue: draining ${backlog.length} unprocessed docs`);
    }
    for (const doc of backlog) {
      try {
        await opts.consume(doc);
        await markWebhookProcessed(doc._id!);
      } catch (err) {
        log.error(`webhook-queue: backlog consume failed for ${doc._id}`, { err });
        await markWebhookProcessed(doc._id!, err as Error);
      }
    }
  }

  const pipeline = sources
    ? [{ $match: { operationType: "insert", "fullDocument.source": { $in: sources } } }]
    : [{ $match: { operationType: "insert" } }];

  let stream: ChangeStream<WebhookQueueDoc> | null = col.watch(pipeline, {
    fullDocument: "updateLookup",
  });
  let stopped = false;

  (async () => {
    try {
      for await (const change of stream as AsyncIterable<ChangeStreamDocument<WebhookQueueDoc>>) {
        if (change.operationType !== "insert") continue;
        const doc = change.fullDocument as WebhookQueueDoc;
        try {
          await opts.consume(doc);
          await markWebhookProcessed(doc._id!);
        } catch (err) {
          log.error(`webhook-queue: consume failed for ${doc._id}`, { err });
          await markWebhookProcessed(doc._id!, err as Error);
        }
      }
    } catch (err) {
      if (!stopped) log.error("webhook-queue: changeStream loop crashed", { err });
    }
  })();

  return async () => {
    stopped = true;
    await stream?.close();
    stream = null;
  };
}
