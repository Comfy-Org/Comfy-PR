import { notion } from "@/lib";

/** Notion People database data source ID */
const PEOPLE_DS_ID = "2496d73d-3650-801f-9738-000b0f1cbac9";

interface NotionProp {
  people?: Array<{ name: string }>;
  rich_text?: Array<{ plain_text: string }>;
  checkbox?: boolean;
}

export interface PersonMapping {
  person: string;
  githubUsername: string;
  slackId: string;
  inactive: boolean;
}

/** Cached promise — fetched once per process */
let peopleMappingsCache: Promise<PersonMapping[]> | null = null;
/** Memoized derived map — built once per successful fetch */
let githubToSlackMapCache: Promise<Map<string, string>> | null = null;

/**
 * Fetch all person mappings from the Notion People database.
 * Successful results are cached for the lifetime of the process.
 * Failed fetches are not cached, so later calls can retry.
 */
export function fetchPeopleMappings(): Promise<PersonMapping[]> {
  if (!peopleMappingsCache) {
    peopleMappingsCache = fetchPeopleMappingsUncached().catch((error) => {
      peopleMappingsCache = null;
      githubToSlackMapCache = null;
      throw error;
    });
  }
  return peopleMappingsCache;
}

async function fetchPeopleMappingsUncached(): Promise<PersonMapping[]> {
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
      const props = (page as { properties?: Record<string, unknown> }).properties as
        | Record<string, NotionProp>
        | undefined;
      const person = props?.["Person"]?.people?.map((p) => p.name).join(", ") || "";
      const githubUsername = (
        props?.["GitHub Username"]?.rich_text?.map((t) => t.plain_text).join("") || ""
      ).trim();
      const slackId = (
        props?.["SlackID"]?.rich_text?.map((t) => t.plain_text).join("") || ""
      ).trim();
      const inactive = props?.["Inactive"]?.checkbox || false;

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
export function getGithubToSlackMap(): Promise<Map<string, string>> {
  if (!githubToSlackMapCache) {
    githubToSlackMapCache = fetchPeopleMappings()
      .then((mappings) => {
        const map = new Map<string, string>();
        for (const m of mappings) {
          if (!m.inactive && m.githubUsername && m.slackId) {
            map.set(m.githubUsername.toLowerCase(), m.slackId);
          }
        }
        return map;
      })
      .catch((error) => {
        githubToSlackMapCache = null;
        throw error;
      });
  }
  return githubToSlackMapCache;
}

/**
 * Look up a Slack user ID by GitHub username using the Notion People database.
 * Case-insensitive. Returns null if no mapping found.
 */
export async function findSlackIdByGithubUsername(githubUsername: string): Promise<string | null> {
  const map = await getGithubToSlackMap();
  return map.get(githubUsername.toLowerCase()) ?? null;
}
