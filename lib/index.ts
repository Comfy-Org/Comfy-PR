import { VERBOSE } from "@/src/constants";
import { createOctokit } from "@/src/createOctokit";
import KeyvSqlite from "@keyv/sqlite";
import Notion from "@notionhq/client";
import { WebClient } from "@slack/web-api";
import DIE from "@snomiao/die";
import Keyv from "keyv";
import KeyvCacheProxy, { globalThisCached } from "keyv-cache-proxy";
import KeyvNedbStore from "keyv-nedb-store";
import KeyvNest from "keyv-nest";
import { lazyProxy } from "../src/utils/lazyProxy";

export const github = KeyvCacheProxy({
  store: globalThisCached("github", () => new Keyv(KeyvNest(new Map(), new KeyvNedbStore(".cache/github.nedb.yaml")))),
  prefix: "github.",
  onFetched: (key, val) => {
    VERBOSE && console.debug(`CACHE.${key} := ${JSON.stringify(val).length}`);
    return undefined;
  },
})(
  lazyProxy(() =>
    createOctokit({
      auth: process.env.GH_TOKEN_COMFY_PR_BOT || DIE("missing env.GH_TOKEN_COMFY_PR_BOT"),
    }),
  ),
);

export const notion = KeyvCacheProxy({
  store: globalThisCached("notion", () => new Keyv(KeyvNest(new Map(), new KeyvSqlite(".cache/notion.sqlite")))),
  prefix: "notion.",
  onFetched: (key, val) => {
    // for dataSources query endpoint, only results with max-size with next_cursor
    if (key.startsWith("notion.dataSources.query")) {
      if (!val?.next_cursor) return { skip: true };
    }
    VERBOSE && console.debug(`CACHE.${key} := ${JSON.stringify(val).length}`);
  },
})(lazyProxy(() => new Notion.Client({ auth: process.env.NOTION_TOKEN || DIE("missing env.NOTION_TOKEN") })));

export const slack = KeyvCacheProxy({
  store: globalThisCached("slack", () => new Keyv(KeyvNest(new Map(), new KeyvNedbStore(".cache/slack.nedb.yaml")))),
  prefix: "slack.",
  onFetched: (key, val) => {
    VERBOSE && console.debug(`CACHE.${key} := ${JSON.stringify(val).length}`);
    return undefined;
  },
})(
  lazyProxy(() => {
    return new WebClient(process.env.SLACK_BOT_TOKEN?.trim() || DIE("missing env.SLACK_BOT_TOKEN"));
  }),
);
