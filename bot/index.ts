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

  // Log prefixes for quick verification (never leak full secrets)
  const check = (k: string, len = 6) => `${k}=${process.env[k]?.slice(0, len) ?? "(unset)"}...`;
  console.log(
    "[env] " +
      [
        check("SLACK_SIGNING_SECRET"),
        check("SLACK_BOT_TOKEN", 12),
        check("PRBOT_PORT", 10),
        check("NODE_ENV", 10),
      ].join(" | "),
  );
}

if (import.meta.main) {
  await loadEnvLocalWithOverride();
  console.log("Starting ComfyPR Slack Bot...");
  const client = await (await import("./slack-bot.ts")).startSlackBot();
  console.log("ComfyPR Slack Bot Done.");
}
