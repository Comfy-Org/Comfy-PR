#!/usr/bin/env bun
/**
 * Atlas Search Index Fix Script
 *
 * This script replaces dynamic search index mappings with static mappings
 * to reduce the number of indexed fields from 3,587+ to under 100.
 *
 * The problem: Dynamic mapping automatically indexes ALL fields in documents.
 * Collections like GithubWebhookEvents store full GitHub API payloads with
 * hundreds of nested fields, causing massive index bloat.
 *
 * The solution: Static mappings that only index fields actually used in queries.
 *
 * Usage:
 *   bun scripts/atlas-search/fix-search-indexes.ts [--dry-run]
 *
 * Options:
 *   --dry-run   Show what would be changed without applying changes
 *
 * WARNING: Modifying search indexes will cause reindexing which takes time.
 * Run during low-traffic periods.
 */

import { db } from "@/src/db";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Static mapping definitions for each collection that needs Atlas Search.
 *
 * These mappings only index fields that are actually queried.
 * Setting dynamic: false prevents auto-indexing of all other fields.
 */
const SEARCH_INDEX_DEFINITIONS: Record<
  string,
  {
    name: string;
    definition: {
      mappings: {
        dynamic: boolean;
        fields?: Record<string, unknown>;
      };
    };
  }[]
> = {
  // GithubWebhookEvents: If search is needed, only index specific payload fields
  GithubWebhookEvents: [
    {
      name: "default",
      definition: {
        mappings: {
          dynamic: false, // CRITICAL: Disable dynamic mapping
          fields: {
            // Top-level metadata fields (commonly queried)
            eventType: { type: "string", analyzer: "lucene.keyword" },
            deliveryId: { type: "string", analyzer: "lucene.keyword" },
            receivedAt: { type: "date" },
            processed: { type: "boolean" },

            // Repository identification (commonly searched)
            "payload.repository.full_name": { type: "string", analyzer: "lucene.keyword" },
            "payload.repository.name": { type: "string", analyzer: "lucene.keyword" },
            "payload.repository.owner.login": { type: "string", analyzer: "lucene.keyword" },

            // Pull request fields (if searching PRs)
            "payload.pull_request.number": { type: "number" },
            "payload.pull_request.title": { type: "string", analyzer: "lucene.standard" },
            "payload.pull_request.state": { type: "string", analyzer: "lucene.keyword" },

            // Issue fields (if searching issues)
            "payload.issue.number": { type: "number" },
            "payload.issue.title": { type: "string", analyzer: "lucene.standard" },
            "payload.issue.state": { type: "string", analyzer: "lucene.keyword" },

            // Sender info (commonly filtered)
            "payload.sender.login": { type: "string", analyzer: "lucene.keyword" },
            "payload.action": { type: "string", analyzer: "lucene.keyword" },
          },
        },
      },
    },
  ],

  // CNRepos: Custom node repositories
  CNRepos: [
    {
      name: "default",
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            repository: { type: "string", analyzer: "lucene.keyword" },
            "info.state": { type: "string", analyzer: "lucene.keyword" },
            "crPulls.state": { type: "string", analyzer: "lucene.keyword" },
            "candidate.state": { type: "string", analyzer: "lucene.keyword" },
            "on_registry.state": { type: "string", analyzer: "lucene.keyword" },
          },
        },
      },
    },
  ],

  // SlackMsgs: Slack messages
  SlackMsgs: [
    {
      name: "default",
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            text: { type: "string", analyzer: "lucene.standard" },
            channel: { type: "string", analyzer: "lucene.keyword" },
            ts: { type: "string", analyzer: "lucene.keyword" },
            status: { type: "string", analyzer: "lucene.keyword" },
            mtime: { type: "date" },
          },
        },
      },
    },
  ],
};

async function fixSearchIndexes() {
  console.log("=".repeat(70));
  console.log("Atlas Search Index Fix Script");
  console.log("=".repeat(70));
  console.log(`\nMode: ${DRY_RUN ? "DRY RUN (no changes will be made)" : "LIVE"}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  let hasSearchIndexes = false;

  for (const [collName, indexDefs] of Object.entries(SEARCH_INDEX_DEFINITIONS)) {
    console.log("-".repeat(70));
    console.log(`Collection: ${collName}`);
    console.log("-".repeat(70));

    const collection = db.collection(collName);

    try {
      // Check existing search indexes
      const existingIndexes = await collection.listSearchIndexes().toArray();

      if (existingIndexes.length === 0) {
        console.log(`  No search indexes found. Skipping.`);
        console.log(`  (If you need search, run with --create-new flag)`);
        continue;
      }

      hasSearchIndexes = true;

      for (const existingIndex of existingIndexes) {
        const indexName = (existingIndex as { name: string }).name;
        const newDef = indexDefs.find((d) => d.name === indexName);

        if (!newDef) {
          console.log(`\n  Index "${indexName}": No static mapping defined.`);
          console.log(`  Consider deleting if not needed, or add definition to this script.`);
          continue;
        }

        const existingMappings = (
          existingIndex as { latestDefinition?: { mappings?: { dynamic?: boolean } } }
        ).latestDefinition?.mappings;
        const isDynamic = existingMappings?.dynamic === true;

        console.log(`\n  Index: ${indexName}`);
        console.log(`  Current dynamic mapping: ${isDynamic ? "⚠️  YES" : "✅ NO"}`);

        if (isDynamic) {
          const staticFieldCount = Object.keys(newDef.definition.mappings.fields || {}).length;
          console.log(`  Proposed static field count: ${staticFieldCount}`);
          console.log(`  Expected reduction: ~3500+ fields → ${staticFieldCount} fields`);

          if (DRY_RUN) {
            console.log(`\n  [DRY RUN] Would update index with:`);
            console.log(`  ${JSON.stringify(newDef.definition, null, 2).replace(/\n/g, "\n  ")}`);
          } else {
            console.log(`\n  Updating index...`);
            try {
              await collection.updateSearchIndex(indexName, newDef.definition);
              console.log(`  ✅ Index updated successfully!`);
              console.log(`  Note: Reindexing will occur in background.`);
            } catch (updateErr) {
              console.error(`  ❌ Failed to update: ${updateErr}`);
            }
          }
        } else {
          console.log(`  Already using static mapping. No changes needed.`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not supported") || msg.includes("not available")) {
        console.log(`  Search indexes not available for this collection.`);
      } else {
        console.log(`  Error checking indexes: ${msg}`);
      }
    }
  }

  if (!hasSearchIndexes) {
    console.log("\n" + "=".repeat(70));
    console.log("No Dynamic Search Indexes Found");
    console.log("=".repeat(70));
    console.log(`
The search indexes may be configured directly in MongoDB Atlas UI.

To fix via Atlas UI:
1. Go to MongoDB Atlas → Database → Browse Collections
2. Select cluster: comfyorg-prod-cluster-553af61
3. Click "Search Indexes" tab
4. For each index with dynamic mapping:
   a. Click "Edit Index"
   b. Change "Field Mappings" from "Dynamic" to "Static"
   c. Add only the specific fields you need to search
   d. Click "Save"

See: scripts/atlas-search/README.md for detailed instructions
See: scripts/atlas-search/static-mappings.json for recommended mappings
`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));

  if (DRY_RUN) {
    console.log(`\nThis was a dry run. To apply changes, run without --dry-run flag:`);
    console.log(`  bun scripts/atlas-search/fix-search-indexes.ts`);
  } else {
    console.log(`\nChanges applied. Monitor the Atlas Search index status for reindexing progress.`);
  }

  await db.close();
}

// Run if executed directly
if (import.meta.main) {
  await fixSearchIndexes();
}

export { fixSearchIndexes, SEARCH_INDEX_DEFINITIONS };
