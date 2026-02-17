#!/usr/bin/env bun
/**
 * MongoDB Migration Script: Normalize GitHub URLs
 *
 * This script migrates existing database records to normalize GitHub URLs
 * from comfyanonymous/* to Comfy-Org/* format to prevent duplicates.
 *
 * NOTE: This script is OPTIONAL. The save functions in all task handlers
 * have been updated with incremental migration logic that automatically
 * migrates records as they're accessed. This script is provided to speed
 * up the migration process if you want to migrate all records immediately.
 *
 * With incremental migration:
 * - New workers check for both old and new URL formats before inserting
 * - Existing records are automatically updated to new format when accessed
 * - No race conditions or duplicates
 * - Safe to deploy without running this script
 *
 * Usage:
 *   bun scripts/migrate-urls-to-comfy-org.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Preview changes without modifying the database
 */

import { db } from "@/src/db";
import { normalizeGithubUrl } from "@/src/normalizeGithubUrl";

const DRY_RUN = process.argv.includes("--dry-run");

interface MigrationResult {
  collection: string;
  field: string;
  totalDocuments: number;
  updatedDocuments: number;
  errors: number;
}

const results: MigrationResult[] = [];

/**
 * Migrate URLs in a collection
 */
async function migrateCollection(
  collectionName: string,
  urlFields: string[],
  uniqueField?: string,
): Promise<MigrationResult[]> {
  const collection = db.collection(collectionName);
  const fieldResults: MigrationResult[] = [];

  console.log(`\n📦 Migrating collection: ${collectionName}`);

  for (const field of urlFields) {
    console.log(`  📝 Processing field: ${field}`);

    // Find all documents with comfyanonymous URLs in this field
    const query: any = {};
    query[field] = { $regex: /github\.com\/comfyanonymous\//i };

    const documents = await collection.find(query).toArray();

    const result: MigrationResult = {
      collection: collectionName,
      field,
      totalDocuments: documents.length,
      updatedDocuments: 0,
      errors: 0,
    };

    if (documents.length === 0) {
      console.log(`    ✓ No documents to migrate for field: ${field}`);
      fieldResults.push(result);
      continue;
    }

    console.log(`    Found ${documents.length} documents with old URLs`);

    // Update each document
    for (const doc of documents) {
      const oldUrl = doc[field];
      if (!oldUrl || typeof oldUrl !== "string") continue;

      const newUrl = normalizeGithubUrl(oldUrl);

      if (oldUrl === newUrl) {
        continue; // No change needed
      }

      if (DRY_RUN) {
        console.log(`    [DRY-RUN] Would update: ${oldUrl} -> ${newUrl}`);
        result.updatedDocuments++;
        continue;
      }

      try {
        // Check if a document with the normalized URL already exists
        if (uniqueField === field) {
          const query: any = {};
          query[field] = newUrl;
          const existing = await collection.findOne(query);

          if (existing && existing._id.toString() !== doc._id.toString()) {
            console.log(
              `    ⚠️  Skipping ${oldUrl}: Document with normalized URL already exists`,
            );
            // Keep the document with the normalized URL, mark old one for review
            await collection.updateOne(
              { _id: doc._id },
              { $set: { _migration_conflict: true, _migration_old_url: oldUrl } },
            );
            result.errors++;
            continue;
          }
        }

        // Update the document
        const updateDoc: any = {};
        updateDoc[field] = newUrl;

        await collection.updateOne({ _id: doc._id }, { $set: updateDoc });

        console.log(`    ✓ Updated: ${oldUrl} -> ${newUrl}`);
        result.updatedDocuments++;
      } catch (error) {
        console.error(`    ✗ Error updating document:`, error);
        result.errors++;
      }
    }

    fieldResults.push(result);
  }

  return fieldResults;
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log("🚀 Starting GitHub URL Migration");
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "LIVE"}`);
  console.log("Converting: comfyanonymous/* → Comfy-Org/*");

  try {
    // Migrate each collection with URL fields
    const migrations = [
      // Issue transfer tasks
      {
        collection: "GithubFrontendIssueTransferTask",
        fields: ["sourceIssueUrl", "targetIssueUrl", "commentUrl"],
        uniqueField: undefined, // uses sourceIssueNumber as unique
      },
      {
        collection: "GithubComfyUIToDesktopIssueTransferTask",
        fields: ["sourceIssueUrl", "targetIssueUrl", "commentUrl"],
        uniqueField: undefined,
      },
      {
        collection: "GithubWorkflowTemplatesIssueTransferTask",
        fields: ["sourceIssueUrl", "targetIssueUrl", "commentUrl"],
        uniqueField: undefined,
      },
      {
        collection: "GithubFrontendToComfyuiIssueTransferTask",
        fields: ["sourceIssueUrl", "targetIssueUrl", "commentUrl"],
        uniqueField: undefined,
      },
      {
        collection: "GithubDesktopIssueTransferTask",
        fields: ["sourceIssueUrl", "targetIssueUrl", "commentUrl"],
        uniqueField: undefined,
      },
      {
        collection: "GithubFrontendToDesktopIssueTransferTask",
        fields: ["sourceIssueUrl", "targetIssueUrl", "commentUrl"],
        uniqueField: undefined,
      },

      // Label operations
      {
        collection: "GithubIssueLabelOps",
        fields: ["target_url", "issue_url"],
        uniqueField: "target_url",
      },

      // Release notifications
      {
        collection: "GithubReleaseNotificationTask",
        fields: ["url"],
        uniqueField: "url",
      },
      {
        collection: "GithubFrontendReleaseNotificationTask",
        fields: ["url"],
        uniqueField: "url",
      },

      // Core tag notifications
      {
        collection: "GithubCoreTagNotificationTask",
        fields: ["url"],
        uniqueField: undefined, // uses tagName as unique
      },

      // Design tasks
      {
        collection: "GithubDesignTask",
        fields: ["url", "slackUrl"],
        uniqueField: "url",
      },
    ];

    for (const { collection, fields, uniqueField } of migrations) {
      const migrationResults = await migrateCollection(collection, fields, uniqueField);
      results.push(...migrationResults);
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Migration Summary");
    console.log("=".repeat(60));

    const totalByCollection = results.reduce(
      (acc, r) => {
        acc[r.collection] = acc[r.collection] || { total: 0, updated: 0, errors: 0 };
        acc[r.collection].total += r.totalDocuments;
        acc[r.collection].updated += r.updatedDocuments;
        acc[r.collection].errors += r.errors;
        return acc;
      },
      {} as Record<string, { total: number; updated: number; errors: number }>,
    );

    for (const [collection, stats] of Object.entries(totalByCollection)) {
      console.log(`\n${collection}:`);
      console.log(`  Total documents:   ${stats.total}`);
      console.log(`  Updated:           ${stats.updated}`);
      console.log(`  Errors/Conflicts:  ${stats.errors}`);
    }

    const grandTotal = Object.values(totalByCollection).reduce(
      (acc, s) => ({
        total: acc.total + s.total,
        updated: acc.updated + s.updated,
        errors: acc.errors + s.errors,
      }),
      { total: 0, updated: 0, errors: 0 },
    );

    console.log("\n" + "-".repeat(60));
    console.log(`Grand Total:`);
    console.log(`  Total documents:   ${grandTotal.total}`);
    console.log(`  Updated:           ${grandTotal.updated}`);
    console.log(`  Errors/Conflicts:  ${grandTotal.errors}`);
    console.log("=".repeat(60));

    if (DRY_RUN) {
      console.log("\n⚠️  DRY-RUN mode: No changes were made to the database");
      console.log("Run without --dry-run to apply changes");
    } else {
      console.log("\n✅ Migration completed successfully!");

      if (grandTotal.errors > 0) {
        console.log(
          "\n⚠️  Some documents had conflicts and were marked with _migration_conflict flag",
        );
        console.log("Review these documents manually and resolve conflicts");
      }
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    await db.close();
  }
}

// Run migration
if (import.meta.main) {
  runMigration().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { runMigration };
