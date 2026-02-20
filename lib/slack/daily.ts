#!/usr/bin/env bun
import { slack } from "@/lib";
import { getSlackChannel } from "@/lib/slack/channels";
import DIE from "@snomiao/die";
import { parseArgs } from "util";
import { pageFlow } from "sflow";
import sflow from "sflow";
import { parseSlackMessageToMarkdown } from "./parseSlackMessageToMarkdown";
import { slackTsToISO } from "./slackTsToISO";

const BOT_USER_ID = process.env.SLACK_BOT_USER_ID || "U078499LK5K"; // ComfyPR-Bot user ID
const DAILY_UPDATES_CHANNEL = "daily-updates";

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      help: {
        type: "boolean",
        short: "h",
        default: false,
      },
      post: {
        type: "boolean",
        short: "p",
        default: false,
      },
      save: {
        type: "boolean",
        short: "s",
        default: false,
      },
      verbose: {
        type: "boolean",
        short: "v",
        default: false,
      },
      "dry-run": {
        type: "boolean",
        short: "d",
        default: false,
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    console.log(`
Usage: bun bot/slack/daily.ts [options]

Generate daily activity reports for ComfyPR-Bot.

Options:
  -h, --help      Show this help message
  -s, --save      Save report to ./reports/daily-YYYY-MM-DD.md
  -p, --post      Post short summary to #daily-updates channel
  -v, --verbose   Show detailed progress information
  -d, --dry-run   Preview what would be posted (use with --post)

Examples:
  bun bot/slack/daily.ts                    # View report
  bun bot/slack/daily.ts --save             # Save to file
  bun bot/slack/daily.ts --post --dry-run   # Preview post
  bun bot/slack/daily.ts --post             # Post to #daily-updates
  bun bot/slack/daily.ts --save --verbose   # Save with verbose output
`);
    process.exit(0);
  }

  const report = await dailyUpdate({ verbose: values.verbose });

  if (values.save) {
    const today = new Date().toISOString().split("T")[0];
    const filename = `./reports/daily-${today}.md`;
    await Bun.write(filename, report);
    console.log(`\n✅ Report saved to ${filename}`);
  }

  if (values.post) {
    if (values["dry-run"]) {
      console.log("\n🔍 DRY RUN - Would post to #daily-updates:");
      const shortSummary = report.split("## Short Summary (for #daily-updates)")[1] || report;
      console.log(shortSummary);
    } else {
      await postDailyUpdate(report);
      console.log("\n✅ Posted to #daily-updates");
    }
  }

  if (!values.save && !values.post) {
    console.log(report);
  }
}

export default async function dailyUpdate(options: { verbose?: boolean } = {}) {
  const { verbose = false } = options;

  // 1. Read all messages sent by ComfyPR-Bot today
  const botMessages = await readBotMessagesToday(verbose);

  // 2. Read #daily-updates channel to understand the format
  const dailyUpdatesFormat = await readDailyUpdatesFormat(verbose);

  // 3. Generate a report.md
  const report = await generateDailyReport(botMessages, dailyUpdatesFormat);

  return report;
}

/**
 * Read all messages sent by the bot today across all channels
 */
async function readBotMessagesToday(verbose = false) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = String(+today / 1000);

  if (verbose) console.log(`Reading bot messages since ${today.toISOString()}`);

  // Get all channels the bot is in
  const channels = await pageFlow(undefined as string | undefined, async (cursor, limit = 100) => {
    const resp = await slack.conversations.list({
      cursor,
      limit,
      types: "public_channel,private_channel",
      exclude_archived: true,
    });
    return {
      next: resp.response_metadata?.next_cursor || undefined,
      data: resp.channels || [],
    };
  })
    .flat()
    .filter((ch) => ch.is_member) // Only channels the bot is a member of
    .toArray();

  if (verbose) console.log(`Found ${channels.length} channels to scan`);

  // Read messages from each channel
  const allMessages = await sflow(channels)
    .map(async (channel) => {
      try {
        const messages = await pageFlow(
          undefined as string | undefined,
          async (cursor, limit = 100) => {
            const resp = await slack.conversations.history({
              channel: channel.id || DIE("missing channel id"),
              cursor,
              limit,
              oldest: todayTimestamp,
            });
            return {
              next: resp.response_metadata?.next_cursor || undefined,
              data: resp.messages || [],
            };
          },
        )
          .flat()
          .filter((msg) => msg.user === BOT_USER_ID || msg.bot_id) // Filter for bot messages
          .map(async (msg) => {
            const text = msg.text || "";
            // Truncate very long messages for readability
            const truncatedText = text.length > 500 ? text.substring(0, 500) + "..." : text;

            return {
              channel: channel.name || channel.id || "unknown",
              channelId: channel.id || DIE("missing channel id"),
              ts: msg.ts || DIE("missing ts"),
              iso: slackTsToISO(msg.ts || DIE("missing ts")),
              text: truncatedText,
              markdown: await parseSlackMessageToMarkdown(truncatedText),
              thread_ts: msg.thread_ts,
              reply_count: msg.reply_count || 0,
              is_truncated: text.length > 500,
            };
          })
          .toArray();

        if (verbose) console.log(`Found ${messages.length} bot messages in #${channel.name}`);
        return messages;
      } catch (error) {
        if (verbose) console.error(`Error reading channel ${channel.name}:`, error);
        return [];
      }
    })
    .flat()
    .toArray();

  return allMessages;
}

/**
 * Read recent messages from #daily-updates to understand the format
 */
async function readDailyUpdatesFormat(verbose = false) {
  try {
    const channel = await getSlackChannel(DAILY_UPDATES_CHANNEL);
    const channelId = channel.id || DIE("missing channel id");

    // Read last 10 messages to understand the format
    const resp = await slack.conversations.history({
      channel: channelId,
      limit: 10,
    });

    const messages = await sflow(resp.messages || [])
      .filter((msg) => !msg.bot_id) // Exclude bot messages
      .map(async (msg) => {
        const user = msg.user
          ? await slack.users
              .info({ user: msg.user })
              .then((res) => res.user?.name || `<@${msg.user}>`)
              .catch(() => `<@${msg.user}>`)
          : "Unknown";

        return {
          username: user,
          text: msg.text || "",
          markdown: await parseSlackMessageToMarkdown(msg.text || ""),
          iso: slackTsToISO(msg.ts || DIE("missing ts")),
        };
      })
      .toArray();

    return messages;
  } catch (error) {
    if (verbose) console.error(`Error reading #${DAILY_UPDATES_CHANNEL}:`, error);
    return [];
  }
}

/**
 * Generate a daily report based on bot messages and team format
 */
async function generateDailyReport(
  botMessages: Awaited<ReturnType<typeof readBotMessagesToday>>,
  dailyUpdatesFormat: Awaited<ReturnType<typeof readDailyUpdatesFormat>>,
) {
  const today = new Date().toISOString().split("T")[0];

  // Group messages by channel
  const messagesByChannel = botMessages.reduce(
    (acc, msg) => {
      if (!acc[msg.channel]) {
        acc[msg.channel] = [];
      }
      acc[msg.channel].push(msg);
      return acc;
    },
    {} as Record<string, typeof botMessages>,
  );

  // Generate report
  let report = `# ComfyPR-Bot Daily Report - ${today}\n\n`;
  report += `## Summary\n\n`;
  report += `- Total messages sent: ${botMessages.length}\n`;
  report += `- Channels active: ${Object.keys(messagesByChannel).length}\n\n`;

  // Handle case when no messages were sent
  if (botMessages.length === 0) {
    report += `_No messages sent today._\n\n`;
  }

  // Add format examples from team
  if (dailyUpdatesFormat.length > 0) {
    report += `## Team Daily Update Format (for reference)\n\n`;
    dailyUpdatesFormat.slice(0, 3).forEach((msg) => {
      report += `**${msg.username}** (${msg.iso}):\n`;
      report += `${msg.markdown}\n\n`;
    });
  }

  // Add bot activity by channel
  report += `## Bot Activity by Channel\n\n`;
  for (const [channel, messages] of Object.entries(messagesByChannel)) {
    report += `### #${channel} (${messages.length} messages)\n\n`;
    messages.slice(0, 5).forEach((msg) => {
      const preview = msg.markdown.substring(0, 150).replace(/\n/g, " ");
      const suffix = msg.is_truncated || msg.markdown.length > 150 ? "..." : "";
      report += `- **${msg.iso.split("T")[1].split(".")[0]}**: ${preview}${suffix}\n`;
    });
    if (messages.length > 5) {
      report += `- ... and ${messages.length - 5} more messages\n`;
    }
    report += `\n`;
  }

  // Generate short summary for posting
  const shortSummary = generateShortSummary(botMessages, messagesByChannel);
  report += `\n## Short Summary (for #daily-updates)\n\n`;
  report += shortSummary;

  return report;
}

/**
 * Generate a short summary suitable for posting to #daily-updates
 */
function generateShortSummary(
  botMessages: Awaited<ReturnType<typeof readBotMessagesToday>>,
  messagesByChannel: Record<string, typeof botMessages>,
) {
  const today = new Date().toISOString().split("T")[0];
  const channelList = Object.keys(messagesByChannel)
    .map((ch) => `#${ch}`)
    .join(", ");

  let summary = `🤖 **ComfyPR-Bot** - ${today}\n\n`;
  summary += `Sent ${botMessages.length} messages across ${Object.keys(messagesByChannel).length} channels (${channelList})\n\n`;

  // Highlight key activities
  const keyChannels = ["comfyprbot", "prbot", "develop", "desktop"];
  const keyActivities = keyChannels
    .filter((ch) => messagesByChannel[ch])
    .map((ch) => `- #${ch}: ${messagesByChannel[ch].length} updates`)
    .join("\n");

  if (keyActivities) {
    summary += `Key activities:\n${keyActivities}\n`;
  }

  return summary;
}

/**
 * Post the daily update to #daily-updates channel
 */
async function postDailyUpdate(report: string) {
  try {
    const channel = await getSlackChannel(DAILY_UPDATES_CHANNEL);
    const channelId = channel.id || DIE("missing channel id");

    // Extract just the short summary
    const shortSummary = report.split("## Short Summary (for #daily-updates)")[1] || report;

    await slack.chat.postMessage({
      channel: channelId,
      text: shortSummary,
    });

    console.log(`Posted daily update to #${DAILY_UPDATES_CHANNEL}`);
  } catch (error) {
    console.error(`Error posting to #${DAILY_UPDATES_CHANNEL}:`, error);
  }
}
