#!/usr/bin/env bun
import { notion } from "@/lib";
import sflow from "sflow";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

/**
 * Search Notion pages from Comfy-Org team workspace
 * Usage: bun bot/notion/search.ts --query "search term"
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

    const results = await sflow(response.results as Array<Record<string, unknown>>)
      .map(async (page) => {
        let title = "Untitled";
        if (page.properties) {
          const titleProp = Object.values(page.properties as Record<string, unknown>).find(
            (prop: unknown) => (prop as Record<string, unknown>).type === "title",
          ) as Record<string, unknown>;
          if (
            titleProp?.title &&
            (titleProp.title as unknown[])?.[0] &&
            ((titleProp.title as Record<string, unknown>[])[0] as Record<string, unknown>)
              ?.plain_text
          ) {
            title = ((titleProp.title as Record<string, unknown>[])[0] as Record<string, unknown>)
              .plain_text as string;
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

    return { results, total: response.results.length, hasMore: response.has_more };
  } catch (error) {
    console.error("Error searching Notion:", error);
    throw error;
  }
}

if (import.meta.main) {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("notion-search")
    .usage("$0 --query <search term> [--limit <number>]")
    .option("query", {
      alias: "q",
      type: "string",
      description: "Search query",
      demandOption: true,
    })
    .option("limit", {
      alias: "l",
      type: "number",
      description: "Maximum number of results",
      default: 10,
    })
    .example('$0 -q "ComfyUI setup"', "Search for ComfyUI setup docs")
    .example('$0 -q "sprint planning" -l 5', "Search with limit")
    .help()
    .parse();

  const { results, total, hasMore } = await searchNotion(argv.query, argv.limit);

  console.log(
    `Found ${results.length} of ${total}${hasMore ? "+" : ""} results for query: "${argv.query}"\n`,
  );

  for (const result of results) {
    console.log(`Title: ${result.title}`);
    console.log(`URL: ${result.url}`);
    console.log(`Last edited: ${result.last_edited_time}`);
    console.log("---");
  }
}

export { searchNotion };
