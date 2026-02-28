import { createOctokit } from "@/lib/github/createOctokit";
import KeyvSqlite from "@keyv/sqlite";
import { Client as Notion } from "@notionhq/client";
import { WebClient } from "@slack/web-api";
import DIE from "@snomiao/die";
import Keyv from "keyv";
import KeyvCacheProxy, { globalThisCached } from "keyv-cache-proxy";
import KeyvNedbStore from "keyv-nedb-store";
import KeyvNest from "keyv-nest";
import { lazyInstantiate } from "@/src/utils/lazyProxy";
import { logger } from "@/src/logger";

// Detect test environment - use in-memory cache to avoid SQLite issues
const isTestEnv = process.env.NODE_ENV === "test" || process.env.CI === "true" || !!process.env.CI;

export const github = KeyvCacheProxy({
  store: globalThisCached(
    "github",
    () => new Keyv(KeyvNest(new Map(), new KeyvNedbStore("./.cache/github.jsonl"))),
  ),
  prefix: "github.",
  onFetched: (key, val) => {
    logger.debug(`CACHE.${key} := ${JSON.stringify(val).length}`);
    return undefined;
  },
})(
  lazyInstantiate(() =>
    createOctokit({
      auth: process.env.GH_TOKEN_COMFY_PR_BOT || DIE("missing env.GH_TOKEN_COMFY_PR_BOT"),
    }),
  ),
);

export const notion = KeyvCacheProxy({
  store: globalThisCached("notion", () =>
    isTestEnv
      ? new Keyv()
      : new Keyv(KeyvNest(new Map(), new KeyvSqlite("./.cache/notion.sqlite"))),
  ),
  prefix: "notion.",
  onFetched: (key, val) => {
    // for dataSources query endpoint, only results with max-size with next_cursor
    if (key.startsWith("notion.dataSources.query")) {
      if (!val?.next_cursor) return { skip: true };
    }
    logger.debug(`CACHE.${key} := ${JSON.stringify(val).length}`);
  },
})(
  lazyInstantiate(
    () => new Notion({ auth: process.env.NOTION_TOKEN || DIE("missing env.NOTION_TOKEN") }),
  ),
);

export const slack = lazyInstantiate(
  () => new WebClient(process.env.SLACK_BOT_TOKEN?.trim() || DIE("missing env.SLACK_BOT_TOKEN")),
);

export const slackCached = KeyvCacheProxy({
  store: globalThisCached(
    "slack",
    () => new Keyv(KeyvNest(new Map(), new KeyvNedbStore("./.cache/slack.jsonl"))),
  ),
  prefix: "slack.",
  onFetched: (key, val) => {
    logger.debug(`CACHE.${key} := ${JSON.stringify(val).length}`);
    return undefined;
  },
})(slack);
