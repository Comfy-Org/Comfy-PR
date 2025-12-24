#!/usr/bin/env bun
import { notion } from "@/lib";
import sflow from "sflow";
import { parseArgs } from "util";

/**
 * Search Notion pages from Comfy-Org team workspace
 * Usage: bun bot/notion-search.ts --query "search term"
 */
async function searchNotion(query: string, limit: number = 10) {
  try {
    const response = await notion.search({
      query,
      page_size: limit,
      filter: {
        property: "object",
        value: "page",
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    });

    const results = await sflow(response.results)
      .map(async (page: any) => {
        // Extract title from page properties
        let title = "Untitled";
        if (page.properties) {
          const titleProp = Object.values(page.properties).find((prop: any) => prop.type === "title") as any;
          if (titleProp?.title?.[0]?.plain_text) {
            title = titleProp.title[0].plain_text;
          }
        }

        return {
          id: page.id,
          title,
          url: page.url,
          last_edited_time: page.last_edited_time,
          created_time: page.created_time,
        };
      })
      .toArray();

    return results;
  } catch (error) {
    console.error("Error searching Notion:", error);
    throw error;
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      query: {
        type: "string",
        short: "q",
      },
      limit: {
        type: "string",
        short: "l",
        default: "10",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values.query) {
    console.error('Usage: bun bot/notion-search.ts --query "<search term>" [--limit <number>]');
    console.error('Example: bun bot/notion-search.ts --query "ComfyUI setup" --limit 5');
    process.exit(1);
  }

  const results = await searchNotion(values.query, parseInt(values.limit || "10"));

  console.log(`Found ${results.length} results for query: "${values.query}"\n`);

  for (const result of results) {
    console.log(`Title: ${result.title}`);
    console.log(`URL: ${result.url}`);
    console.log(`Last edited: ${result.last_edited_time}`);
    console.log("---");
  }
}

export { searchNotion };
