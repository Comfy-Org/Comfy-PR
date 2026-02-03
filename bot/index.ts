#!/usr/bin/env bun
/**
 * ComfyPR Bot
 *
 * Slack Bot
 * @author snomiao <snomiao@gmail.com>
 */

// supports only slack now
if (import.meta.main) {
  console.log("Starting ComfyPR Slack Bot...");
  const client = await (await import("./slack-bot.ts")).startSlackBot();
  console.log("ComfyPR Slack Bot Done.");
}
