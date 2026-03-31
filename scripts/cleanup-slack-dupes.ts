#!/usr/bin/env bun
/**
 * One-off script to delete duplicate Slack messages in #product-design.
 * Keeps the oldest message in each duplicate group, deletes the rest.
 * Run with --dry to preview without deleting.
 */
import { WebClient } from "@slack/web-api";
import { readFile } from "fs/promises";
import { join } from "path";

// Load .env.local
const envPath = join(import.meta.dir, "../.env.local");
try {
  const env = await readFile(envPath, "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const CHANNEL = "C0A4FRL1JN9"; // #product-design
const DRY_RUN = process.argv.includes("--dry");
const token = process.env.SLACK_BOT_TOKEN;
if (!token) throw new Error("SLACK_BOT_TOKEN not set");

const slack = new WebClient(token);

async function fetchAllMessages() {
  const messages: { ts: string; text: string; username?: string; bot_id?: string }[] = [];
  let cursor: string | undefined;
  do {
    const res = await slack.conversations.history({ channel: CHANNEL, limit: 200, cursor });
    messages.push(...(res.messages as typeof messages));
    cursor = (res.response_metadata as any)?.next_cursor || undefined;
  } while (cursor);
  return messages;
}

const all = await fetchAllMessages();
console.log(`Total messages: ${all.length}`);

const botMsgs = all.filter(m => m.username === "comfyprbot" || m.bot_id);
console.log(`Bot messages: ${botMsgs.length}`);

// Group by normalized text content
const byText = new Map<string, typeof botMsgs>();
for (const msg of botMsgs) {
  const key = (msg.text || "").trim();
  if (!byText.has(key)) byText.set(key, []);
  byText.get(key)!.push(msg);
}

const dupeGroups = [...byText.entries()].filter(([, msgs]) => msgs.length > 1);
console.log(`Duplicate groups: ${dupeGroups.length}`);

let totalToDelete = 0;
for (const [text, msgs] of dupeGroups) {
  msgs.sort((a, b) => Number(a.ts) - Number(b.ts));
  const [keep, ...toDelete] = msgs;
  totalToDelete += toDelete.length;
  console.log(`\nKeep: ${keep.ts} | Delete ${toDelete.length} duplicate(s)`);
  console.log(`  "${text.slice(0, 100).replace(/\n/g, " ")}"`);
  for (const msg of toDelete) {
    console.log(`  ${DRY_RUN ? "[dry]" : ""} Deleting: ${msg.ts}`);
    if (!DRY_RUN) {
      try {
        await slack.chat.delete({ channel: CHANNEL, ts: msg.ts });
        await new Promise(r => setTimeout(r, 300));
      } catch (e: any) {
        console.error(`  ERROR: ${e.message}`);
      }
    }
  }
}

console.log(`\nTotal to delete: ${totalToDelete}`);
if (DRY_RUN) console.log("\nDRY RUN — rerun without --dry to actually delete");
