import KeyvSqlite from "@keyv/sqlite";
import { WebClient } from "@slack/web-api";
import crypto from "crypto";
import fs from "fs/promises";
import Keyv from "keyv";
import path from "path";
import { getSlack, isSlackAvailable } from ".";
import { createLogger } from "../logger";

const logger = createLogger("slackCached");

const CACHE_DIR = path.join(process.cwd(), "node_modules/.cache/Comfy-PR");
const CACHE_FILE = path.join(CACHE_DIR, "slack-cache.sqlite");
const DEFAULT_TTL = process.env.LOCAL_DEV
  ? 30 * 60 * 1000 // cache 30 minutes when local dev
  : 0 * 60 * 1000; // cache 0 minute in production

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

let keyv: Keyv | null = null;

async function getKeyv() {
  if (!keyv) {
    await ensureCacheDir();
    keyv = new Keyv({
      store: new KeyvSqlite(CACHE_FILE),
      ttl: DEFAULT_TTL,
    });
  }
  return keyv;
}

type DeepAsyncWrapper<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => Promise<any>
    ? T[K]
    : T[K] extends (...args: any[]) => any
      ? (...args: Parameters<T[K]>) => Promise<ReturnType<T[K]>>
      : T[K] extends object
        ? DeepAsyncWrapper<T[K]>
        : T[K];
};
function createCachedProxy<T extends object>(target: T, basePath: string[] = []): DeepAsyncWrapper<T> {
  return new Proxy<T>(target, {
    get(obj, prop) {
      const value = (obj as any)[prop];

      if (typeof value === "function") {
        return async function (...args: any[]) {
          const cacheKey = createCacheKey(basePath, prop, args);
          const keyvInstance = await getKeyv();

          // Try to get from cache first
          const cached = await keyvInstance.get(cacheKey);
          if (cached !== undefined) {
            // logger.debug(`Cache hit`, { cacheKey }); // cache hit info for debug
            return cached;
          }

          // Call the original function
          const result = await value.apply(obj, args);

          // Cache the result
          await keyvInstance.set(cacheKey, result);

          return result;
        };
      } else if (typeof value === "object" && value !== null) {
        // Recursively wrap nested objects
        return createCachedProxy(value, [...basePath, prop.toString()]);
      }

      return value;
    },
  }) as DeepAsyncWrapper<T> & {
    clear: () => Promise<void>;
  };
  async function clear(): Promise<void> {
    const keyvInstance = await getKeyv();
    await keyvInstance.clear();
  }
  function createCacheKey(basePath: string[], prop: string | symbol, args: any[]): string {
    // Create a deterministic key from the path and arguments
    const fullPath = [...basePath, prop.toString()];
    const apiPath = fullPath.join(".");

    const argsText = args.map((e) => JSON.stringify(e)).join(",");
    const maxLength = 120 - apiPath.length - "gh.".length - 8 - 3; // Maximum length for args display

    let displayArgs = argsText;
    if (argsText.length > maxLength) {
      const start = argsText.substring(0, maxLength / 2);
      const end = argsText.substring(argsText.length - maxLength / 2);
      displayArgs = `${start}...${end}`;
    }

    const hash = crypto.createHash("md5").update(argsText).digest("hex").substring(0, 8);
    const cacheKey = `gh.${apiPath}(${displayArgs})#${hash}`;

    return cacheKey;
  }
}

let cachedSlackInstance: ReturnType<typeof createCachedProxy<WebClient>> | null = null;

export function getSlackCached(): ReturnType<typeof createCachedProxy<WebClient>> {
  if (!cachedSlackInstance) {
    cachedSlackInstance = createCachedProxy(getSlack());
  }
  return cachedSlackInstance;
}

// For backwards compatibility with deprecation warning
export const slackCached = new Proxy({} as ReturnType<typeof createCachedProxy<WebClient>>, {
  get(_target, prop) {
    // console.warn("Direct access to 'slackCached' is deprecated. Use getSlackCached() instead.");
    const cached = getSlackCached();
    return (cached as any)[prop];
  },
});

// manual test with real api
if (import.meta.main) {
  async function runTest() {
    if (!isSlackAvailable()) {
      logger.info("Slack token not configured, skipping test");
      return;
    }

    // Test the cached client
    logger.info("Testing cached Slack client...");

    const slack = getSlack();

    // This should make a real API call
    const result1 = await slack.users.profile.get({});
    logger.info("First call result", { name: result1.profile });

    // This should use cache
    const result2 = await slack.users.profile.get({});
    logger.info("Second call result (cached)", { name: result2.profile });

    logger.info("Cache test complete!");
  }

  runTest().catch((error) => logger.error("Test failed", error));
}
