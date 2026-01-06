/**
 * Parse Slack message URL to extract channel ID and timestamp
 * @param url - Slack message URL
 * @returns Object with channel ID and timestamp, or null if invalid
 *
 * Supports various Slack URL formats:
 * - https://WORKSPACE.slack.com/archives/CHANNEL/pTIMESTAMP
 * - https://WORKSPACE.slack.com/archives/CHANNEL/pTIMESTAMP?thread_ts=THREAD_TS
 * - https://app.slack.com/client/TEAM/CHANNEL/TIMESTAMP
 */
export function parseSlackUrl(url: string): { channel: string; ts: string } | null {
  try {
    const urlObj = new URL(url);

    // Format 1: /archives/CHANNEL/pTIMESTAMP (most common)
    const archivesMatch = urlObj.pathname.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/);
    if (archivesMatch) {
      const channel = archivesMatch[1];
      const timestampPart = archivesMatch[2];

      // Convert pTIMESTAMP to UNIX.MICROSECONDS format
      // p1767577596210299 -> 1767577596.210299
      const ts = `${timestampPart.slice(0, 10)}.${timestampPart.slice(10)}`;

      // Check if this is a thread reply (use thread_ts if available)
      const threadTs = urlObj.searchParams.get('thread_ts');

      return {
        channel,
        ts: threadTs || ts,
      };
    }

    // Format 2: /client/TEAM/CHANNEL/TIMESTAMP
    const clientMatch = urlObj.pathname.match(/\/client\/[A-Z0-9]+\/([A-Z0-9]+)\/(\d+)/);
    if (clientMatch) {
      const channel = clientMatch[1];
      const timestampPart = clientMatch[2];
      const ts = `${timestampPart.slice(0, 10)}.${timestampPart.slice(10)}`;

      return {
        channel,
        ts,
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

// CLI usage
if (import.meta.main) {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: bun bot/slack/parseSlackUrl.ts <slack-url>");
    console.error("\nExample:");
    console.error("  bun bot/slack/parseSlackUrl.ts 'https://comfy-organization.slack.com/archives/D09GGTE7S00/p1767577596210299'");
    process.exit(1);
  }

  const result = parseSlackUrl(url);

  if (result) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error("Failed to parse Slack URL");
    process.exit(1);
  }
}
