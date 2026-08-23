#!/usr/bin/env bun
import { slack } from "@/lib/slack";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Resolve at call time, not at import time — `prbot feedback` calls
 * loadEnvLocal() inside its handler, so env vars from .env.local aren't
 * available when this module is first evaluated.
 */
function feedbackChannel(): string {
  return process.env.PRBOT_FEEDBACK_CHANNEL || "prbot-feedback";
}

export type FeedbackType = "bug" | "feature" | "error" | "other";

export interface FeedbackOptions {
  message: string;
  type?: FeedbackType;
  /** Extra context (command output, error trace, etc.) — will be in a collapsed block */
  context?: string;
  /** Who/what submitted this (e.g. "amp-agent", "claude-yes", user name) */
  source?: string;
}

/** Get prbot CLI version from package.json */
function getCliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../../package.json"), "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

/** Detect the git repo URL and branch from cwd, normalized to GitHub URL */
function getRepoUrl(): string | undefined {
  try {
    const remote = execSync("git remote get-url origin", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Normalize remote to GitHub HTTPS URL
    // ssh: git@github.com:owner/repo.git → https://github.com/owner/repo
    // https: https://github.com/owner/repo.git → https://github.com/owner/repo
    let url = remote.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "");

    if (branch && branch !== "HEAD") {
      url += `/tree/${branch}`;
    }

    return url;
  } catch {
    return undefined;
  }
}

const typeEmoji: Record<FeedbackType, string> = {
  bug: "🐛",
  feature: "💡",
  error: "🔴",
  other: "📝",
};

/**
 * Post feedback to the private #prbot-feedback Slack channel.
 * Returns the message timestamp on success.
 */
export async function postFeedback(opts: FeedbackOptions): Promise<string> {
  const { message, type = "other", context, source } = opts;
  const emoji = typeEmoji[type];

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${type.toUpperCase()}: Feedback`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: message },
    },
  ];

  const metaParts: string[] = [];
  if (source) metaParts.push(`*Source:* ${source}`);
  const repoUrl = getRepoUrl();
  if (repoUrl) metaParts.push(`*Repo:* <${repoUrl}|${repoUrl.replace("https://github.com/", "")}>`);
  metaParts.push(`*CLI:* v${getCliVersion()}`);
  metaParts.push(`*Timestamp:* ${new Date().toISOString()}`);

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: metaParts.join("  ·  ") }],
  });

  // Post the main message
  const channelId = await resolveChannel(feedbackChannel());
  const result = await slack.chat.postMessage({
    channel: channelId,
    text: `${emoji} [${type.toUpperCase()}] ${message.slice(0, 200)}`,
    blocks: blocks as never[],
  });

  if (!result.ok) {
    throw new Error(`Failed to post feedback: ${result.error}`);
  }

  // If there's extra context, post it as a thread reply to keep the channel clean
  if (context && result.ts) {
    const contextText =
      context.length > 2900 ? context.slice(0, 2900) + "\n… (truncated)" : context;

    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: result.ts,
      text: `\`\`\`\n${contextText}\n\`\`\``,
      mrkdwn: true,
    });
  }

  return result.ts!;
}

/** Resolve a channel name (without #) to its ID, auto-joining if needed.
 * Refuses to auto-create a public channel because callers send stack traces
 * and command output as `context` — a misconfigured channel name would
 * otherwise leak internal failures into a brand new public channel.
 */
async function resolveChannel(nameOrId: string): Promise<string> {
  // Already a Slack ID — accept C (public), G (private), D (DM) prefixes.
  if (/^[CGD][A-Z0-9]+$/.test(nameOrId)) return nameOrId;

  // Paginate through channels because workspaces can exceed `limit:1000`
  // and feedback delivery must remain reliable.
  let cursor: string | undefined;
  do {
    const list = await slack.conversations.list({
      types: "public_channel,private_channel",
      limit: 1000,
      exclude_archived: true,
      ...(cursor ? { cursor } : {}),
    });
    const ch = list.channels?.find((c) => c.name === nameOrId);
    if (ch?.id) {
      if (!ch.is_member) {
        try {
          await slack.conversations.join({ channel: ch.id });
        } catch {
          // already_in_channel is fine
        }
      }
      return ch.id;
    }
    cursor = list.response_metadata?.next_cursor || undefined;
  } while (cursor);

  // Not found — fail closed. We deliberately do NOT auto-create here:
  // creating a public channel for what's documented as a *private* feedback
  // sink would leak the very first submission (which may contain stack
  // traces, command output, or env values) to anyone who joins.
  throw new Error(
    `Slack channel #${nameOrId} not found. Create it manually as a private channel ` +
      `and invite the bot, then set PRBOT_FEEDBACK_CHANNEL to its name or ID.`,
  );
}

// CLI entry
if (import.meta.main) {
  const args = process.argv.slice(2);
  const msgIdx = args.indexOf("-m");
  const typeIdx = args.indexOf("--type");
  const ctxIdx = args.indexOf("--context");
  const srcIdx = args.indexOf("--source");

  const message = msgIdx !== -1 ? args[msgIdx + 1] : undefined;
  const type = (typeIdx !== -1 ? args[typeIdx + 1] : "other") as FeedbackType;
  const context = ctxIdx !== -1 ? args[ctxIdx + 1] : undefined;
  const source = srcIdx !== -1 ? args[srcIdx + 1] : undefined;

  if (!message) {
    console.error(
      "Usage: bun lib/slack/feedback.ts -m <message> [--type bug|feature|error|other] [--context <text>] [--source <name>]",
    );
    process.exit(1);
  }

  const ts = await postFeedback({ message, type, context, source });
  console.log(`✓ Feedback posted to #prbot-feedback (ts: ${ts})`);
}
