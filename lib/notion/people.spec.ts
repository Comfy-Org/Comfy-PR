import { afterAll, describe, expect, it } from "bun:test";

// Use bun's mock.module (mirrors the pattern used by app/tasks/gh-priority-sync/index.spec.ts)
const { mock } = await import("bun:test");

type NotionPageFixture = {
  id: string;
  properties: Record<string, unknown>;
};

/** In-memory "database" the mocked Notion client serves from. */
const mockNotionPages: NotionPageFixture[] = [];

function richText(content: string) {
  return content ? [{ plain_text: content }] : [];
}

function makePersonRow(opts: {
  id: string;
  uniqueId: string;
  githubUsername: string;
  slackId: string;
  personName?: string;
  personEmail?: string;
  inactive?: boolean;
}): NotionPageFixture {
  return {
    id: opts.id,
    properties: {
      UniqueID: { title: richText(opts.uniqueId) },
      "GitHub Username": { rich_text: richText(opts.githubUsername) },
      SlackID: { rich_text: richText(opts.slackId) },
      Inactive: { checkbox: opts.inactive ?? false },
      Person: {
        people: opts.personName ? [{ name: opts.personName, email: opts.personEmail }] : [],
      },
    },
  };
}

// Fixtures loosely mirror real rows fetched from the Comfy-Org People DB while
// investigating https://github.com/Comfy-Org/ComfyUI_frontend/pull/14206 and
// /pull/15342 for this change.
mockNotionPages.push(
  // "nav" — no linked Notion account (Person is empty); only the UniqueID
  // title column carries the display name used in PR attribution lines.
  makePersonRow({
    id: "page-nav",
    uniqueId: "Nav",
    githubUsername: "nav-tej",
    slackId: "U0AMJURRLKV",
  }),
  // Christian — has a linked Notion account, so "Person" also carries the name.
  makePersonRow({
    id: "page-christian",
    uniqueId: "Christian Byrne",
    githubUsername: "christian-byrne",
    slackId: "U087MJCDHHC",
    personName: "Christian Byrne",
    personEmail: "cbyrne@comfy.org",
  }),
  // Multi-word name to exercise first-name-only matching.
  makePersonRow({
    id: "page-jane",
    uniqueId: "Jane Doe",
    githubUsername: "jane-doe",
    slackId: "U000JANE",
  }),
  // Inactive row — must never be matched.
  makePersonRow({
    id: "page-inactive",
    uniqueId: "Old Contractor",
    githubUsername: "old-contractor",
    slackId: "U000OLD",
    inactive: true,
  }),
);

const mockNotionClient = {
  dataSources: {
    query: async ({
      start_cursor,
      page_size = 100,
    }: {
      start_cursor?: string;
      page_size?: number;
    }) => {
      let results = mockNotionPages;
      if (start_cursor) {
        const idx = mockNotionPages.findIndex((p) => p.id === start_cursor);
        if (idx >= 0) results = mockNotionPages.slice(idx);
      }
      const paged = results.slice(0, page_size);
      const hasMore = results.length > page_size;
      const nextCursor = hasMore ? results[page_size].id : null;
      return { results: paged, next_cursor: nextCursor, has_more: hasMore };
    },
  },
};

mock.module("@notionhq/client", () => ({
  Client: class {
    constructor() {
      return mockNotionClient;
    }
  },
}));

// Bypass the on-disk caching layers so tests only ever hit the mock client above.
mock.module("keyv-cache-proxy", () => ({
  default: () => (target: unknown) => target,
  globalThisCached: (_name: string, factory: () => unknown) => factory(),
}));
const keyvStorage = new Map<string, unknown>();
mock.module("keyv", () => ({
  default: class Keyv {
    async get(key: string) {
      return keyvStorage.get(key);
    }
    async set(key: string, value: unknown) {
      keyvStorage.set(key, value);
      return true;
    }
    async delete(key: string) {
      return keyvStorage.delete(key);
    }
  },
}));
mock.module("keyv-nest", () => ({
  default: (...stores: unknown[]) => stores[stores.length - 1],
}));
mock.module("keyv-nedb-store", () => ({
  default: class KeyvNedbStore {
    constructor(_path: string) {}
  },
}));

// bun test runs all spec files in a single shared process, so mutating
// process.env here leaks into every other spec file for the rest of the
// run unless we restore it. In particular, an unrestored fake
// SLACK_BOT_TOKEN made lib/slack/daily.spec.ts's "do we have a real Slack
// token" check pass, which then made real (failing) calls to the Slack API.
const originalEnv = {
  NOTION_TOKEN: process.env.NOTION_TOKEN,
  GH_TOKEN_COMFY_PR_BOT: process.env.GH_TOKEN_COMFY_PR_BOT,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
};
afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

process.env.NOTION_TOKEN = "test-notion-token";
process.env.GH_TOKEN_COMFY_PR_BOT = "test-gh-token";
process.env.SLACK_BOT_TOKEN = "xoxb-test-token";

const { findGithubUsernameByPersonName, findSlackIdByGithubUsername } = await import("./people");

describe("findGithubUsernameByPersonName", () => {
  it("resolves a first-name-only attribution (e.g. PR #14206's 'nav') via the UniqueID title column", async () => {
    expect(await findGithubUsernameByPersonName("nav")).toBe("nav-tej");
  });

  it("is case-insensitive", async () => {
    expect(await findGithubUsernameByPersonName("NAV")).toBe("nav-tej");
    expect(await findGithubUsernameByPersonName("christian byrne")).toBe("christian-byrne");
  });

  it("resolves a full-name attribution (e.g. PR #15342's 'Christian Byrne') via the linked Person name", async () => {
    expect(await findGithubUsernameByPersonName("Christian Byrne")).toBe("christian-byrne");
  });

  it("resolves a first-name match against a multi-word display name", async () => {
    expect(await findGithubUsernameByPersonName("Jane")).toBe("jane-doe");
  });

  it("does not match on last name alone", async () => {
    expect(await findGithubUsernameByPersonName("Doe")).toBeNull();
  });

  it("returns null for a name with no match", async () => {
    expect(await findGithubUsernameByPersonName("someone-unknown")).toBeNull();
  });

  it("returns null for an empty/blank name", async () => {
    expect(await findGithubUsernameByPersonName("")).toBeNull();
    expect(await findGithubUsernameByPersonName("   ")).toBeNull();
  });

  it("never matches an inactive person", async () => {
    expect(await findGithubUsernameByPersonName("Old Contractor")).toBeNull();
  });
});

describe("findSlackIdByGithubUsername (existing behavior, sanity check)", () => {
  it("still resolves by GitHub username directly", async () => {
    expect(await findSlackIdByGithubUsername("nav-tej")).toBe("U0AMJURRLKV");
    expect(await findSlackIdByGithubUsername("christian-byrne")).toBe("U087MJCDHHC");
  });
});
