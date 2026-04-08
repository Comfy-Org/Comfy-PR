#!/usr/bin/env bun
import { Client } from "@notionhq/client";
import DIE from "@snomiao/die";
import yaml from "yaml";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

/** Notion People database data source ID */
const PEOPLE_DS_ID = "2496d73d-3650-801f-9738-000b0f1cbac9";

export interface PersonMapping {
  person: string;
  githubUsername: string;
  slackId: string;
  inactive: boolean;
}

/** Cached promise — fetched once per process */
let peopleMappingsCache: Promise<PersonMapping[]> | null = null;

/**
 * Fetch all person mappings from the Notion People database.
 * Results are cached for the lifetime of the process.
 */
export function fetchPeopleMappings(): Promise<PersonMapping[]> {
  if (!peopleMappingsCache) {
    peopleMappingsCache = fetchPeopleMappingsUncached();
  }
  return peopleMappingsCache;
}

async function fetchPeopleMappingsUncached(): Promise<PersonMapping[]> {
  const notion = new Client({
    auth: process.env.NOTION_TOKEN || DIE("missing env.NOTION_TOKEN"),
  });

  const results: PersonMapping[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.dataSources.query({
      data_source_id: PEOPLE_DS_ID,
      result_type: "page",
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of res.results) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Notion API returns loosely-typed page objects
      const props = (page as any).properties; // biome-ignore lint: Notion untyped
      const person =
        (props?.["Person"]?.people as Array<{ name: string }> | undefined)
          ?.map((p) => p.name)
          .join(", ") || "";
      const githubUsername =
        (props?.["GitHub Username"]?.rich_text as Array<{ plain_text: string }> | undefined)
          ?.map((t) => t.plain_text)
          .join("") || "";
      const slackId =
        (props?.["SlackID"]?.rich_text as Array<{ plain_text: string }> | undefined)
          ?.map((t) => t.plain_text)
          .join("") || "";
      const inactive = (props?.["Inactive"]?.checkbox as boolean) || false;

      results.push({ person, githubUsername, slackId, inactive });
    }

    cursor = res.next_cursor ?? undefined;
  } while (cursor);

  return results;
}

/**
 * Build a case-insensitive GitHub username → Slack ID map
 * from the Notion People database. Only includes active members
 * with both a GitHub username and a Slack ID.
 */
export async function getGithubToSlackMap(): Promise<Map<string, string>> {
  const mappings = await fetchPeopleMappings();
  const map = new Map<string, string>();
  for (const m of mappings) {
    if (!m.inactive && m.githubUsername && m.slackId) {
      map.set(m.githubUsername.toLowerCase(), m.slackId);
    }
  }
  return map;
}

/**
 * Look up a Slack user ID by GitHub username using the Notion People database.
 * Case-insensitive. Returns null if no mapping found.
 */
export async function findSlackIdByGithubUsername(githubUsername: string): Promise<string | null> {
  const map = await getGithubToSlackMap();
  return map.get(githubUsername.toLowerCase()) ?? null;
}

if (import.meta.main) {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("notion-people")
    .usage("$0 [--github <username>] [--all] [--missing]")
    .option("github", {
      alias: "g",
      type: "string",
      description: "Look up a specific GitHub username",
    })
    .option("all", {
      alias: "a",
      type: "boolean",
      description: "List all active mappings",
      default: false,
    })
    .option("missing", {
      alias: "m",
      type: "boolean",
      description: "Show active members missing a GitHub username",
      default: false,
    })
    .example("$0 --github christian-byrne", "Look up a specific user")
    .example("$0 --all", "List all GitHub→Slack mappings")
    .example("$0 --missing", "Show members without GitHub usernames")
    .help()
    .parse();

  const mappings = await fetchPeopleMappings();

  if (argv.github) {
    const slackId = await findSlackIdByGithubUsername(argv.github);
    if (slackId) {
      const entry = mappings.find(
        (m) => m.githubUsername.toLowerCase() === argv.github!.toLowerCase(),
      );
      console.log(
        yaml.stringify({
          github: argv.github,
          slackId,
          person: entry?.person,
        }),
      );
    } else {
      console.log(`No mapping found for GitHub username: ${argv.github}`);
      process.exit(1);
    }
  } else if (argv.missing) {
    const missing = mappings.filter((m) => !m.inactive && !m.githubUsername && m.slackId);
    console.log(`Active members without GitHub username: ${missing.length}\n`);
    console.log(yaml.stringify(missing));
  } else {
    // Default: show all active mappings
    const active = mappings.filter((m) => !m.inactive && m.slackId);
    console.log(`Active people mappings: ${active.length}\n`);
    console.log(
      yaml.stringify(
        active.map((m) => ({
          person: m.person,
          github: m.githubUsername || "(not set)",
          slackId: m.slackId,
        })),
      ),
    );
  }
}
