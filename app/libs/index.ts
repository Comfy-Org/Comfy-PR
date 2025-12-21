import { createOctokit } from "@/src/createOctokit";
import KeyvSqlite from "@keyv/sqlite";
import Notion from "@notionhq/client";
import DIE from "@snomiao/die";
import Keyv from "keyv";
import KeyvCacheProxy, { globalThisCached } from "keyv-cache-proxy";
import KeyvNedbStore from "keyv-nedb-store";
import KeyvNest from "keyv-nest";
const VERVOSE = process.env.VERBOSE;

const _github = () =>
  createOctokit({ auth: process.env.GH_TOKEN_COMFY_PR_BOT || DIE("missing env.GH_TOKEN_COMFY_PR_BOT") });
const _notion = () => new Notion.Client({ auth: process.env.NOTION_TOKEN || DIE("missing env.NOTION_TOKEN") });

export const github = KeyvCacheProxy({
  store: globalThisCached("github", () => new Keyv(KeyvNest(new Map(), new KeyvNedbStore(".cache/github.nedb.yaml")))),
  prefix: "github.",
  onFetched: (key, val) => {
    VERVOSE && console.debug(`[cache] Stored ${JSON.stringify(val).length} from ${key}`);
    return undefined;
  },
})(lazyProxy(_github));

export const notion = KeyvCacheProxy({
  store: globalThisCached("notion", () => new Keyv(KeyvNest(new Map(), new KeyvSqlite(".cache/notion.sqlite")))),
  prefix: "notion.",
  onFetched: (key, val) => {
    VERVOSE && console.debug(`[cache] Stored ${JSON.stringify(val).length} from ${key}`);
    // for dataSources query endpoint, only results with max-size with next_cursor
    if (key.startsWith("notion.dataSources.query")) {
      if (!val?.next_cursor) {
        VERVOSE && console.debug(`[cache] Skipped incompleted data: ${key}`);
        return { skip: true };
      }
    }
  },
})(lazyProxy(_notion));

function lazyProxy<T>(fn: () => T): T {
  let cached: T | null = null;
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (cached === null) {
          cached = fn();
        }
        return (cached as any)[prop];
      },
      apply(_, __, args) {
        if (cached === null) {
          cached = fn();
        }
        return (cached as any)(...args);
      },
    },
  ) as T;
}
