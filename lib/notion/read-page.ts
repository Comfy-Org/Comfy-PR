#!/usr/bin/env bun
import { notion } from "@/lib";
import sflow from "sflow";
import yaml from "yaml";

/**
 * Read a Notion page's content by page ID or URL
 * Usage: bun lib/notion/read-page.ts <notion-url-or-page-id>
 */

/** Extracts a page ID from a Notion URL, returns null if not a Notion URL. Raw UUIDs pass through. */
export function parseNotionUrl(url: string): string | null {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(url)) return url;

  const bare32 = /^[0-9a-f]{32}$/i;
  if (bare32.test(url)) return formatUuid(url);

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("notion.so") && !parsed.hostname.endsWith("notion.site"))
      return null;

    // Extract last 32 hex chars from the pathname
    const match = parsed.pathname.match(/([0-9a-f]{32})\s*$/i);
    if (match) return formatUuid(match[1]);
  } catch {
    return null;
  }

  return null;
}

function formatUuid(hex: string): string {
  const h = hex.replace(/-/g, "");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type RichText = { plain_text: string; annotations?: Annotations; href?: string | null };
type Annotations = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
};

function richTextToMarkdown(richTexts: RichText[]): string {
  return richTexts
    .map((rt) => {
      let text = rt.plain_text;
      const a = rt.annotations;
      if (a?.code) text = `\`${text}\``;
      if (a?.bold) text = `**${text}**`;
      if (a?.italic) text = `*${text}*`;
      if (a?.strikethrough) text = `~~${text}~~`;
      if (rt.href) text = `[${text}](${rt.href})`;
      return text;
    })
    .join("");
}

function blockToMarkdown(block: Record<string, unknown>, indent = ""): string {
  const type = block.type as string;
  const data = block[type] as Record<string, unknown> | undefined;
  const rich = (data?.rich_text as RichText[]) ?? [];
  const text = richTextToMarkdown(rich);

  switch (type) {
    case "paragraph":
      return `${indent}${text}`;
    case "heading_1":
      return `${indent}# ${text}`;
    case "heading_2":
      return `${indent}## ${text}`;
    case "heading_3":
      return `${indent}### ${text}`;
    case "bulleted_list_item":
      return `${indent}- ${text}`;
    case "numbered_list_item":
      return `${indent}1. ${text}`;
    case "to_do": {
      const checked = (data?.checked as boolean) ? "x" : " ";
      return `${indent}- [${checked}] ${text}`;
    }
    case "toggle":
      return `${indent}<details><summary>${text}</summary></details>`;
    case "code": {
      const lang = (data?.language as string) || "";
      return `${indent}\`\`\`${lang}\n${text}\n${indent}\`\`\``;
    }
    case "quote":
      return text
        .split("\n")
        .map((l) => `${indent}> ${l}`)
        .join("\n");
    case "callout": {
      const icon = (data?.icon as Record<string, unknown>)?.emoji ?? "";
      return `${indent}> ${icon} ${text}`;
    }
    case "divider":
      return `${indent}---`;
    case "image": {
      const img = data as Record<string, unknown>;
      const caption = richTextToMarkdown((img?.caption as RichText[]) ?? []);
      const fileData = (img?.file ?? img?.external) as Record<string, unknown> | undefined;
      const url = (fileData?.url as string) ?? "";
      return `${indent}![${caption || "image"}](${url})`;
    }
    case "bookmark": {
      const url = (data?.url as string) ?? "";
      const caption = richTextToMarkdown((data?.caption as RichText[]) ?? []);
      return `${indent}[${caption || url}](${url})`;
    }
    case "link_preview": {
      const url = (data?.url as string) ?? "";
      return `${indent}[${url}](${url})`;
    }
    case "table":
      return ""; // table rows are children, handled during recursion
    case "table_row": {
      const cells = (data?.cells as RichText[][]) ?? [];
      const row = cells.map((cell) => richTextToMarkdown(cell)).join(" | ");
      return `${indent}| ${row} |`;
    }
    default:
      return `${indent}[unsupported: ${type}]`;
  }
}

async function fetchBlockChildren(blockId: string, indent = ""): Promise<string[]> {
  const lines: string[] = [];
  let cursor: string | undefined;

  do {
    const resp = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of resp.results as Array<Record<string, unknown>>) {
      const md = blockToMarkdown(block, indent);
      if (md) lines.push(md);

      // For tables, insert header separator after first row
      if ((block as Record<string, unknown>).type === "table") {
        const children = await fetchBlockChildren(block.id as string, indent);
        if (children.length > 0) {
          lines.push(children[0]);
          const colCount = (children[0].match(/\|/g)?.length ?? 1) - 1;
          lines.push(`${indent}| ${Array(colCount).fill("---").join(" | ")} |`);
          lines.push(...children.slice(1));
        }
      } else if ((block as Record<string, unknown>).has_children) {
        const children = await fetchBlockChildren(block.id as string, indent + "  ");
        lines.push(...children);
      }
    }

    cursor = resp.has_more ? (resp.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return lines;
}

function extractTitle(page: Record<string, unknown>): string {
  const properties = page.properties as Record<string, unknown> | undefined;
  if (!properties) return "Untitled";

  const titleProp = Object.values(properties).find(
    (prop: unknown) => (prop as Record<string, unknown>).type === "title",
  ) as Record<string, unknown> | undefined;

  const titleArr = titleProp?.title as RichText[] | undefined;
  if (titleArr?.[0]?.plain_text) return titleArr[0].plain_text;
  return "Untitled";
}

export async function readNotionPage(pageId: string): Promise<{
  title: string;
  url: string;
  last_edited_time: string;
  content: string;
}> {
  const page = (await notion.pages.retrieve({ page_id: pageId })) as Record<string, unknown>;
  const title = extractTitle(page);
  const url = page.url as string;
  const last_edited_time = page.last_edited_time as string;

  const contentLines = await fetchBlockChildren(pageId);
  const content = contentLines.join("\n\n");

  return { title, url, last_edited_time, content };
}

if (import.meta.main) {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: bun lib/notion/read-page.ts <notion-url-or-page-id>");
    process.exit(1);
  }

  const pageId = parseNotionUrl(input) ?? input;
  const result = await readNotionPage(pageId);
  console.log(yaml.stringify(result));
}
