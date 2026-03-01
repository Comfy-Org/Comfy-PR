#!/usr/bin/env bun
/**
 * Migration: Trim CNRepos documents to remove unnecessary fields
 *
 * This migration reduces document sizes by removing fields that were
 * stored from full GitHub API responses but are never used.
 *
 * Expected reduction: ~539 MB → ~10 MB (98%)
 *
 * Usage:
 *   bun scripts/migrate-cnrepos-trim-data.ts [--dry-run] [--limit N]
 *
 * Options:
 *   --dry-run   Preview changes without modifying data
 *   --limit N   Process only N documents (for testing)
 */

import { db } from "@/src/db";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1]) : 0;

// Fields to keep in info.data
const INFO_FIELDS = [
  "html_url",
  "archived",
  "default_branch",
  "private",
  "updated_at",
  "owner",
  "license",
];

// Fields to keep in each pull
const PULL_FIELDS = [
  "number",
  "title",
  "url",
  "html_url",
  "state",
  "prState",
  "body",
  "user",
  "created_at",
  "updated_at",
  "merged_at",
  "closed_at",
  "createdAt",
  "updatedAt",
];

function pickFields<T extends object>(obj: T, fields: string[]): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in obj) {
      result[field] = (obj as Record<string, unknown>)[field];
    }
  }
  return result as Partial<T>;
}

function trimInfoData(info: { data?: Record<string, unknown> } | undefined) {
  if (!info?.data) return info;
  const trimmed = pickFields(info.data, INFO_FIELDS);
  // Trim owner to just login
  if (trimmed.owner && typeof trimmed.owner === "object") {
    trimmed.owner = { login: (trimmed.owner as { login?: string }).login };
  }
  // Trim license to essential fields
  if (trimmed.license && typeof trimmed.license === "object") {
    const lic = trimmed.license as { spdx_id?: string; name?: string };
    trimmed.license = { spdx_id: lic.spdx_id, name: lic.name };
  }
  return { ...info, data: trimmed };
}

function trimPullData(pull: Record<string, unknown> | undefined) {
  if (!pull) return pull;
  const trimmed = pickFields(pull, PULL_FIELDS);
  // Trim user to just login and html_url
  if (trimmed.user && typeof trimmed.user === "object") {
    const user = trimmed.user as { login?: string; html_url?: string };
    trimmed.user = { login: user.login, html_url: user.html_url };
  }
  return trimmed;
}

function trimPullsArray(
  pulls: { data?: Array<Record<string, unknown>>; state?: string; mtime?: Date } | undefined,
) {
  if (!pulls?.data) return pulls;
  return {
    ...pulls,
    data: pulls.data.map((p) => trimPullData(p)),
  };
}

function trimCrPullsArray(
  crPulls:
    | { data?: Array<{ pull?: Record<string, unknown>; [key: string]: unknown }>; state?: string; mtime?: Date }
    | undefined,
) {
  if (!crPulls?.data) return crPulls;
  return {
    ...crPulls,
    data: crPulls.data.map((item) => ({
      ...item,
      pull: trimPullData(item.pull),
      // Keep comments but trim each comment's user
      // Preserve undefined when original comments.data is undefined (not fetched vs empty)
      comments: item.comments
        ? (() => {
            const comments = item.comments as { data?: Array<Record<string, unknown>> } & object;
            const data = Array.isArray(comments.data)
              ? comments.data.map((c) => ({
                  body: c.body,
                  updated_at: c.updated_at,
                  created_at: c.created_at,
                  user: c.user
                    ? { login: (c.user as { login?: string }).login }
                    : undefined,
                }))
              : comments.data; // Preserve undefined
            return {
              ...comments,
              data,
            };
          })()
        : item.comments,
    })),
  };
}

async function migrate() {
  console.log("=".repeat(70));
  console.log("CNRepos Data Trimming Migration");
  console.log("=".repeat(70));
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} documents`);
  console.log();

  const collection = db.collection("CNRepos");

  // Get stats before
  const statsBefore = await db.command({ collStats: "CNRepos" });
  console.log("Before migration:");
  console.log(`  Documents: ${statsBefore.count.toLocaleString()}`);
  console.log(`  Data size: ${(statsBefore.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Avg doc size: ${statsBefore.avgObjSize.toLocaleString()} bytes`);
  console.log();

  // Process documents
  const cursor = LIMIT ? collection.find({}).limit(LIMIT) : collection.find({});

  let processed = 0;
  let modified = 0;
  let totalSizeBefore = 0;
  let totalSizeAfter = 0;

  for await (const doc of cursor) {
    processed++;
    const sizeBefore = JSON.stringify(doc).length;
    totalSizeBefore += sizeBefore;

    // Build update
    const update: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};

    // Trim info
    if (doc.info?.data && Object.keys(doc.info.data).length > INFO_FIELDS.length) {
      update.info = trimInfoData(doc.info);
    }

    // Trim pulls
    if (doc.pulls?.data?.length > 0) {
      const firstPull = doc.pulls.data[0];
      if (firstPull && Object.keys(firstPull).length > PULL_FIELDS.length) {
        update.pulls = trimPullsArray(doc.pulls);
      }
    }

    // Trim crPulls
    if (doc.crPulls?.data?.length > 0) {
      const firstPull = doc.crPulls.data[0]?.pull;
      if (firstPull && Object.keys(firstPull).length > PULL_FIELDS.length) {
        update.crPulls = trimCrPullsArray(doc.crPulls);
      }
    }

    // Remove deprecated fields
    if ("createdPulls" in doc) unset.createdPulls = 1;
    if ("prs" in doc) unset.prs = 1;
    if ("candiate" in doc) unset.candiate = 1; // typo field
    if ("cm" in doc && "cm_ids" in doc) unset.cm = 1; // deprecated
    if ("cr" in doc && "cr_ids" in doc) unset.cr = 1; // deprecated

    const hasUpdate = Object.keys(update).length > 0;
    const hasUnset = Object.keys(unset).length > 0;

    if (hasUpdate || hasUnset) {
      modified++;

      // Calculate new size
      const newDoc = { ...doc, ...update };
      for (const key of Object.keys(unset)) {
        delete (newDoc as Record<string, unknown>)[key];
      }
      const sizeAfter = JSON.stringify(newDoc).length;
      totalSizeAfter += sizeAfter;

      if (!DRY_RUN) {
        const updateOp: Record<string, unknown> = {};
        if (hasUpdate) updateOp.$set = update;
        if (hasUnset) updateOp.$unset = unset;
        await collection.updateOne({ _id: doc._id }, updateOp);
      }

      if (processed <= 5 || processed % 500 === 0) {
        console.log(
          `[${processed}] ${doc.repository}: ${sizeBefore.toLocaleString()} → ${sizeAfter.toLocaleString()} bytes (${Math.round((1 - sizeAfter / sizeBefore) * 100)}% reduction)`,
        );
      }
    } else {
      totalSizeAfter += sizeBefore;
    }

    if (processed % 1000 === 0) {
      console.log(`Processed ${processed.toLocaleString()} documents...`);
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Migration Summary");
  console.log("=".repeat(70));
  console.log(`Documents processed: ${processed.toLocaleString()}`);
  console.log(`Documents modified: ${modified.toLocaleString()}`);
  console.log();
  console.log(`Estimated size before: ${(totalSizeBefore / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Estimated size after: ${(totalSizeAfter / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `Estimated savings: ${((totalSizeBefore - totalSizeAfter) / 1024 / 1024).toFixed(2)} MB (${Math.round((1 - totalSizeAfter / totalSizeBefore) * 100)}%)`,
  );

  if (DRY_RUN) {
    console.log();
    console.log("This was a dry run. To apply changes, run without --dry-run:");
    console.log("  bun scripts/migrate-cnrepos-trim-data.ts");
  } else {
    // Get stats after
    const statsAfter = await db.command({ collStats: "CNRepos" });
    console.log();
    console.log("After migration (actual):");
    console.log(`  Documents: ${statsAfter.count.toLocaleString()}`);
    console.log(`  Data size: ${(statsAfter.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Avg doc size: ${statsAfter.avgObjSize.toLocaleString()} bytes`);
  }

  await db.close();
}

// Run
await migrate();
