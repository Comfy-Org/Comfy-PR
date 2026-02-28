#!/usr/bin/env bun
/**
 * Atlas Search Index Diagnostic Script
 *
 * This script diagnoses Atlas Search index configuration issues including:
 * - Lists all search indexes and their field counts
 * - Identifies indexes with dynamic mapping (causing high field counts)
 * - Provides recommendations for static mapping
 *
 * Usage: bun scripts/atlas-search/diagnose-search-indexes.ts
 *
 * Related alert: "Atlas Search: Maximum Number of Fields Indexed has gone above 1000"
 * Current value: 3,587 fields (should be < 1000)
 */

import { db } from "@/src/db";

interface SearchIndexInfo {
  name: string;
  type: string;
  status: string;
  queryable: boolean;
  latestDefinition?: {
    mappings?: {
      dynamic?: boolean;
      fields?: Record<string, unknown>;
    };
    analyzer?: string;
    searchAnalyzer?: string;
  };
}

async function diagnoseSearchIndexes() {
  console.log("=".repeat(70));
  console.log("Atlas Search Index Diagnostic Report");
  console.log("=".repeat(70));
  console.log(`\nDate: ${new Date().toISOString()}`);

  // Get all collections
  const collections = await db.listCollections().toArray();
  console.log(`\nFound ${collections.length} collections in database\n`);

  let totalDynamicIndexes = 0;
  let indexesFound = false;

  for (const collInfo of collections) {
    const collName = collInfo.name;
    const collection = db.collection(collName);

    try {
      // List search indexes for this collection
      const searchIndexes = await collection.listSearchIndexes().toArray();

      if (searchIndexes.length > 0) {
        indexesFound = true;
        console.log("-".repeat(70));
        console.log(`Collection: ${collName}`);
        console.log("-".repeat(70));

        for (const index of searchIndexes as SearchIndexInfo[]) {
          console.log(`\n  Index Name: ${index.name}`);
          console.log(`  Type: ${index.type || "search"}`);
          console.log(`  Status: ${index.status}`);
          console.log(`  Queryable: ${index.queryable}`);

          const mappings = index.latestDefinition?.mappings;
          if (mappings) {
            const isDynamic = mappings.dynamic === true;
            console.log(`  Dynamic Mapping: ${isDynamic ? "⚠️  YES (PROBLEM!)" : "✅ NO"}`);

            if (isDynamic) {
              totalDynamicIndexes++;
              console.log(`\n  ⚠️  WARNING: Dynamic mapping is enabled!`);
              console.log(`     This causes ALL fields in documents to be indexed.`);
              console.log(`     For collections with nested objects (like webhook payloads),`);
              console.log(`     this can result in thousands of indexed fields.`);
            }

            if (mappings.fields) {
              const fieldCount = Object.keys(mappings.fields).length;
              console.log(`  Static Fields Defined: ${fieldCount}`);
              if (fieldCount < 10) {
                console.log(`  Fields: ${JSON.stringify(Object.keys(mappings.fields))}`);
              }
            }
          }

          console.log(`\n  Full Definition:`);
          console.log(`  ${JSON.stringify(index.latestDefinition, null, 2).replace(/\n/g, "\n  ")}`);
        }
      }
    } catch (err) {
      // listSearchIndexes throws if no search indexes exist or cluster doesn't support it
      // This is expected for most collections
    }
  }

  if (!indexesFound) {
    console.log("No Atlas Search indexes found in any collection.");
    console.log("\nPossible reasons:");
    console.log("  1. Search indexes are defined but not visible via driver API");
    console.log("  2. Indexes are managed directly in Atlas UI");
    console.log("  3. Connection is not to an Atlas cluster with Search enabled");
    console.log("\nTo check indexes via Atlas UI:");
    console.log("  1. Go to MongoDB Atlas → Database → Browse Collections");
    console.log("  2. Select your cluster → Search Indexes tab");
    console.log("  3. Review each index's field mapping configuration");
  }

  console.log("\n" + "=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));
  console.log(`\nTotal indexes with dynamic mapping: ${totalDynamicIndexes}`);

  if (totalDynamicIndexes > 0) {
    console.log(`\n⚠️  ACTION REQUIRED:`);
    console.log(`   ${totalDynamicIndexes} index(es) use dynamic mapping.`);
    console.log(`   Run: bun scripts/atlas-search/fix-search-indexes.ts`);
    console.log(`   to apply static mappings and reduce indexed field count.`);
  }

  // Additional diagnostics: Check document structure of problematic collections
  console.log("\n" + "=".repeat(70));
  console.log("Document Structure Analysis");
  console.log("=".repeat(70));

  const problematicCollections = ["GithubWebhookEvents", "CNRepos", "SlackMsgs"];

  for (const collName of problematicCollections) {
    try {
      const collection = db.collection(collName);
      const sampleDoc = await collection.findOne({});

      if (sampleDoc) {
        const fieldPaths = countFieldPaths(sampleDoc);
        console.log(`\n${collName}:`);
        console.log(`  Estimated unique field paths: ~${fieldPaths}`);

        if (fieldPaths > 100) {
          console.log(`  ⚠️  HIGH FIELD COUNT - likely contributor to index bloat`);
        }
      }
    } catch (err) {
      console.log(`\n${collName}: Unable to analyze (${err instanceof Error ? err.message : err})`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("Recommendations");
  console.log("=".repeat(70));
  console.log(`
1. IMMEDIATE: Disable dynamic mapping on all search indexes
2. Create static mappings only for fields actually used in $search queries
3. Exclude nested payload objects from indexing (use specific paths instead)
4. Consider if Atlas Search is even needed - if not using $search, disable it

See: scripts/atlas-search/fix-search-indexes.ts for automated fix
See: scripts/atlas-search/README.md for manual Atlas UI instructions
`);

  await db.close();
}

/**
 * Count approximate number of unique field paths in a document
 */
function countFieldPaths(obj: unknown, prefix = "", seen = new Set<string>()): number {
  if (obj === null || obj === undefined) return 0;
  if (typeof obj !== "object") return 0;
  if (Array.isArray(obj)) {
    // For arrays, sample first element
    if (obj.length > 0) {
      return countFieldPaths(obj[0], prefix, seen);
    }
    return 0;
  }

  let count = 0;
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!seen.has(path)) {
      seen.add(path);
      count++;
      count += countFieldPaths((obj as Record<string, unknown>)[key], path, seen);
    }
  }
  return count;
}

// Run if executed directly
if (import.meta.main) {
  await diagnoseSearchIndexes();
}

export { diagnoseSearchIndexes };
