#!/usr/bin/env bun
import { slack } from "@/lib/slack";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const FEEDBACK_CHANNEL = process.env.PRBOT_FEEDBACK_CHANNEL || "prbot-feedback";

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
  const channelId = await resolveChannel(FEEDBACK_CHANNEL);
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

/** Resolve a channel name (without #) to its ID, auto-joining or creating if needed */
async function resolveChannel(nameOrId: string): Promise<string> {
  // Already an ID
  if (/^C[A-Z0-9]+$/.test(nameOrId)) return nameOrId;

  // Search existing channels (including ones we haven't joined)
  const list = await slack.conversations.list({
    types: "public_channel,private_channel",
    limit: 1000,
    exclude_archived: true,
  });

  const ch = list.channels?.find((c) => c.name === nameOrId);

  if (ch?.id) {
    // Auto-join if not already a member
    if (!ch.is_member) {
      try {
        await slack.conversations.join({ channel: ch.id });
      } catch {
        // already_in_channel is fine
      }
    }
    return ch.id;
  }

  // Channel doesn't exist or bot can't see it — try to create it
  try {
    const created = await slack.conversations.create({
      name: nameOrId,
      is_private: false,
    });

    if (!created.channel?.id) {
      throw new Error(`Failed to create Slack channel #${nameOrId}`);
    }

    // Set a topic
    await slack.conversations.setTopic({
      channel: created.channel.id,
      topic: "Automated feedback from prbot CLI — bugs, feature requests, and errors",
    });

    return created.channel.id;
  } catch (e: unknown) {
    const slackErr = e as { data?: { error?: string } };
    if (slackErr.data?.error === "name_taken") {
      // Channel exists but bot isn't a member — search again including all types
      // or use conversations.join with channel name (Slack allows joining public channels by name)
      const retry = await slack.conversations.list({
        types: "public_channel",
        limit: 1000,
        exclude_archived: true,
      });
      const found = retry.channels?.find((c) => c.name === nameOrId);
      if (found?.id) {
        await slack.conversations.join({ channel: found.id });
        return found.id;
      }
    }
    throw new Error(
      `Could not find or create Slack channel #${nameOrId}. If it's private, invite the bot manually.`,
    );
  }
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
