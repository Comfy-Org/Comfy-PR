#!/usr/bin/env bun
/**
 * ComfyPR Bot
 *
 * Slack Bot
 * @author snomiao <snomiao@gmail.com>
 */
import { join } from "path";

/**
 * Load .env.local with override semantics so that values in the file
 * take precedence over stale shell env vars injected by pm2/parent shell.
 * Prevents the SLACK_SIGNING_SECRET mismatch incident (2026-04-24).
 */
async function loadEnvLocalWithOverride() {
  const envPath = join(import.meta.dir, "../.env.local");
  try {
    const text = await Bun.file(envPath).text();
    let applied = 0;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      process.env[key] = value;
      applied++;
    }
    console.log(`[env] Loaded ${applied} entries from ${envPath} (override)`);
  } catch {
    console.log(`[env] ${envPath} not found, using shell env only`);
  }

  // Log short prefixes (≤6 chars) so an operator can confirm the right
  // value loaded without exposing enough to attempt token reuse if the log
  // ends up shared. PRBOT_PORT and NODE_ENV are not secrets so the full
  // value is fine.
  const prefix = (k: string) =>
    `${k}=${process.env[k] ? process.env[k]!.slice(0, 6) + "…" : "(unset)"}`;
  const literal = (k: string) => `${k}=${process.env[k] ?? "(unset)"}`;
  console.log(
    "[env] " +
      [
        prefix("SLACK_SIGNING_SECRET"),
        prefix("SLACK_BOT_TOKEN"),
        literal("PRBOT_PORT"),
        literal("NODE_ENV"),
      ].join(" | "),
  );
}

if (import.meta.main) {
  await loadEnvLocalWithOverride();
  console.log("Starting ComfyPR Slack Bot...");
  const client = await (await import("./slack-bot.ts")).startSlackBot();
  console.log("ComfyPR Slack Bot Done.");
}
