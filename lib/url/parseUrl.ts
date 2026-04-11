import { parseSlackUrlSmart } from "../slack/parseSlackUrlSmart";
import { parseNotionUrl } from "../notion/read-page";

export type ParsedUrlType = "slack-message" | "slack-channel" | "slack-file" | "notion-page" | "unknown";

export interface ParsedUrl {
  type: ParsedUrlType;
  url: string;
  // Slack fields
  channel?: string;
  ts?: string;
  fileId?: string;
  // Notion fields
  notionPageId?: string;
}

export function parseUrl(url: string): ParsedUrl {
  try {
    const urlObj = new URL(url);

    // Check for Notion URLs
    if (urlObj.hostname.includes("notion.so") || urlObj.hostname.includes("notion.site")) {
      const pageId = parseNotionUrl(url);
      return {
        type: pageId ? "notion-page" : "unknown",
        url,
        notionPageId: pageId ?? undefined,
      };
    }

    // Check for Slack URLs
    if (
      urlObj.hostname.includes("slack.com") ||
      urlObj.hostname === "files.slack.com"
    ) {
      const parsed = parseSlackUrlSmart(url);
      const typeMap = {
        message: "slack-message",
        channel: "slack-channel",
        file: "slack-file",
        unknown: "unknown",
      } as const;

      return {
        type: typeMap[parsed.type],
        url,
        channel: parsed.channel,
        ts: parsed.ts,
        fileId: parsed.fileId,
      };
    }
  } catch {
    // Invalid URL, fall through to unknown
  }

  return { type: "unknown", url };
}

if (import.meta.main) {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: bun lib/url/parseUrl.ts <url>");
    console.error("\nExamples:");
    console.error("  Slack message: bun lib/url/parseUrl.ts 'https://workspace.slack.com/archives/C123/p1234567890'");
    console.error("  Slack channel: bun lib/url/parseUrl.ts 'https://workspace.slack.com/archives/C123'");
    console.error("  Notion page:   bun lib/url/parseUrl.ts 'https://www.notion.so/my-page-abc123def456'");
    process.exit(1);
  }

  const result = parseUrl(url);
  console.log(JSON.stringify(result, null, 2));
}
