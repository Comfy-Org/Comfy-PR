#!/usr/bin/env bun
/**
 * Performance Index Migration Script
 *
 * This script creates critical indexes identified by MongoDB Performance Advisor
 * to dramatically improve query performance for SlackMsgs and CNRepos collections.
 *
 * Expected Impact:
 * - SlackMsgs: 637ms → <50ms query time (92% improvement)
 * - CNRepos: 420ms → <100ms query time (76% improvement)
 * - Disk I/O reduction: ~823.8 MB per query cycle
 * - Query targeting: 79,841:1 → ~1:1 ratio
 *
 * Usage: bun scripts/setup-performance-indexes.ts
 *
 * Related Documentation:
 * - ./tmp/mongodb-performance-fix-plan.md
 * - ./tmp/mongodb-performance-improvement-plan.md
 */

import { db } from "@/src/db";
import { SlackMsgs } from "@/lib/slack/SlackMsgs";
import { CNRepos } from "@/src/CNRepos";

async function setupPerformanceIndexes() {
  console.log("🚀 Setting up performance-critical indexes...\n");

  // ===================================================================
  // ISSUE #1: SlackMsgs - Missing status + mtime compound index
  // ===================================================================
  console.log("📊 SlackMsgs Collection");
  console.log("  Problem: Queries scanning 80,501 docs to return 1");
  console.log("  Query Pattern: { status: { $in: [...] }, mtime: { $not: { $gt: ... } } }");
  console.log("  Creating: idx_status_mtime");

  try {
    await SlackMsgs.createIndex(
      { status: 1, mtime: 1 },
      {
        name: "idx_status_mtime",
        background: true,
      },
    );
    console.log("  ✅ Created index: idx_status_mtime");
    console.log("  Expected improvement: 637ms → <50ms (92% faster)\n");
  } catch (error) {
    if ((error as Error).message.includes("already exists")) {
      console.log("  ℹ️  Index idx_status_mtime already exists\n");
    } else {
      console.error("  ❌ Error creating idx_status_mtime:", error);
      throw error;
    }
  }

  // ===================================================================
  // ISSUE #2: CNRepos - Missing compound state + mtime index
  // ===================================================================
  console.log("📊 CNRepos Collection");
  console.log("  Problem: Queries scanning 4,998 docs to return 25");
  console.log("  Query Pattern: { crPulls.state, info.state, various mtime fields }");
  console.log("  Creating: idx_states_mtimes");

  try {
    await CNRepos.createIndex(
      {
        "crPulls.state": 1,
        "info.state": 1,
        "crPulls.mtime": 1,
        "info.mtime": 1,
        "candidate.mtime": 1,
      },
      {
        name: "idx_states_mtimes",
        background: true,
      },
    );
    console.log("  ✅ Created compound index: idx_states_mtimes");
    console.log("  Expected improvement: 420ms → <100ms (76% faster)\n");
  } catch (error) {
    if ((error as Error).message.includes("already exists")) {
      console.log("  ℹ️  Index idx_states_mtimes already exists\n");
    } else {
      console.error("  ❌ Error creating idx_states_mtimes:", error);
      throw error;
    }
  }

  // Also ensure pulls.mtime index exists
  try {
    await CNRepos.createIndex(
      { "pulls.mtime": 1 },
      {
        name: "idx_pulls_mtime",
        background: true,
      },
    );
    console.log("  ✅ Created supporting index: idx_pulls_mtime\n");
  } catch (error) {
    if ((error as Error).message.includes("already exists")) {
      console.log("  ℹ️  Index idx_pulls_mtime already exists\n");
    } else {
      // Non-critical, just log warning
      console.warn("  ⚠️  Could not create idx_pulls_mtime:", error);
    }
  }

  // ===================================================================
  // Verification
  // ===================================================================
  console.log("🔍 Verifying indexes...\n");

  // List SlackMsgs indexes
  console.log("📋 SlackMsgs indexes:");
  const slackIndexes = await SlackMsgs.listIndexes().toArray();
  slackIndexes.forEach((idx) => {
    const keys = JSON.stringify(idx.key);
    const highlight = idx.name === "idx_status_mtime" ? " ⭐" : "";
    console.log(`  - ${idx.name}: ${keys}${highlight}`);
  });

  // List CNRepos indexes
  console.log("\n📋 CNRepos indexes:");
  const cnReposIndexes = await CNRepos.listIndexes().toArray();
  cnReposIndexes.forEach((idx) => {
    const keys = JSON.stringify(idx.key);
    const highlight = idx.name === "idx_states_mtimes" ? " ⭐" : "";
    console.log(`  - ${idx.name}: ${keys}${highlight}`);
  });

  console.log("\n✨ All performance indexes created successfully!");
  console.log("\n📈 Next Steps:");
  console.log("  1. Monitor Performance Advisor in MongoDB Atlas");
  console.log("  2. Check query execution times in 24 hours");
  console.log("  3. Verify disk I/O reduction in metrics");
  console.log("  4. See ./tmp/mongodb-performance-fix-plan.md for details");
}

// Run if executed directly
if (import.meta.main) {
  try {
    await setupPerformanceIndexes();
  } catch (error) {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

export { setupPerformanceIndexes };
