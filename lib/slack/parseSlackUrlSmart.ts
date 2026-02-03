/**
 * Smart Slack URL parser that detects the type of Slack URL and returns appropriate action
 * @param url - Slack URL (message, file, or channel)
 * @returns Parsed URL with type and relevant information
 *
 * Supported formats:
 * - Message: https://WORKSPACE.slack.com/archives/CHANNEL/pTIMESTAMP
 * - File: https://files.slack.com/files-pri/TEAM-FILE/FILE or permalink URLs
 * - Channel: https://WORKSPACE.slack.com/archives/CHANNEL
 */

export type SlackUrlType = "message" | "file" | "channel" | "unknown";

export interface ParsedSlackUrl {
  type: SlackUrlType;
  channel?: string;
  ts?: string;
  fileId?: string;
  url: string;
}

export function parseSlackUrlSmart(url: string): ParsedSlackUrl {
  try {
    const urlObj = new URL(url);

    // Check for file URLs
    // Format: https://files.slack.com/files-pri/TEAM-FILE/filename
    // Or: https://workspace.slack.com/files/CHANNEL/FILE_ID
    if (
      urlObj.hostname === "files.slack.com" ||
      urlObj.pathname.includes("/files/") ||
      urlObj.pathname.includes("/files-pri/")
    ) {
      // Try to extract file ID from various formats
      const fileIdMatch =
        urlObj.pathname.match(/\/files\/[A-Z0-9]+\/([A-Z0-9]+)/) ||
        urlObj.pathname.match(/\/files-pri\/[A-Z0-9]+-([A-Z0-9]+)\//) ||
        urlObj.pathname.match(/\/(F[A-Z0-9]+)/);

      return {
        type: "file",
        fileId: fileIdMatch ? fileIdMatch[1] : undefined,
        url,
      };
    }

    // Check for message URLs with timestamp
    // Format: /archives/CHANNEL/pTIMESTAMP
    const messageMatch = urlObj.pathname.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/);
    if (messageMatch) {
      const channel = messageMatch[1];
      const timestampPart = messageMatch[2];
      const ts = `${timestampPart.slice(0, 10)}.${timestampPart.slice(10)}`;

      // Check if this is a thread (use thread_ts if available)
      const threadTs = urlObj.searchParams.get("thread_ts");

      return {
        type: "message",
        channel,
        ts: threadTs || ts,
        url,
      };
    }

    // Check for channel URLs without timestamp
    // Format: /archives/CHANNEL
    const channelMatch = urlObj.pathname.match(/\/archives\/([A-Z0-9]+)\/?$/);
    if (channelMatch) {
      return {
        type: "channel",
        channel: channelMatch[1],
        url,
      };
    }

    // Check for app.slack.com client URLs
    // Format: /client/TEAM/CHANNEL/TIMESTAMP
    const clientMatch = urlObj.pathname.match(/\/client\/[A-Z0-9]+\/([A-Z0-9]+)\/(\d+)/);
    if (clientMatch) {
      const channel = clientMatch[1];
      const timestampPart = clientMatch[2];
      const ts = `${timestampPart.slice(0, 10)}.${timestampPart.slice(10)}`;

      return {
        type: "message",
        channel,
        ts,
        url,
      };
    }

    // Unknown URL format
    return {
      type: "unknown",
      url,
    };
  } catch (error) {
    return {
      type: "unknown",
      url,
    };
  }
}

// CLI usage
if (import.meta.main) {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: bun lib/slack/parseSlackUrlSmart.ts <slack-url>");
    console.error("\nExamples:");
    console.error(
      "  Message: bun lib/slack/parseSlackUrlSmart.ts 'https://workspace.slack.com/archives/C123/p1234567890'",
    );
    console.error(
      "  Channel: bun lib/slack/parseSlackUrlSmart.ts 'https://workspace.slack.com/archives/C123'",
    );
    console.error(
      "  File: bun lib/slack/parseSlackUrlSmart.ts 'https://files.slack.com/files-pri/T123-F456/file.pdf'",
    );
    process.exit(1);
  }

  const result = parseSlackUrlSmart(url);
  console.log(JSON.stringify(result, null, 2));
}
