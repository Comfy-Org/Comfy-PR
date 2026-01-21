import KeyvSqlite from "@keyv/sqlite";
import type { components as ghComponents } from "@octokit/openapi-types";
import crypto from "crypto";
import fs from "fs/promises";
import stableStringify from "json-stable-stringify";
import Keyv from "keyv";
import path from "path";
import { createOctokit } from "@/lib/github/createOctokit";

const GH_TOKEN =
  process.env.GH_TOKEN_COMFY_PR ||
  process.env.GH_TOKEN ||
  "WARNING: missing env.GH_TOKEN from https://github.com/settings/tokens?type=beta";
const octokit = createOctokit({ auth: GH_TOKEN });
export const gh = octokit.rest;

export type GH = ghComponents["schemas"];

const CACHE_DIR = path.join(process.cwd(), "node_modules/.cache/Comfy-PR");
const CACHE_FILE = path.join(CACHE_DIR, "gh-cache.sqlite");
const DEFAULT_TTL =
  process.env.NODE_ENV === "development"
    ? 86400 * 1000 // cache 24 hours when local dev
    : 1 * 60 * 1000; // cache 1 minute in production

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

function createCacheKey(basePath: string[], prop: string | symbol, args: any[]): string {
  // Create a deterministic key from the path and arguments
  const fullPath = [...basePath, prop.toString()];
  const apiPath = fullPath.join(".");

  const argsText = args.map((e) => stableStringify(e)).join(",");
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

function createCachedProxy<T extends object>(target: T, basePath: string[] = []): any {
  return new Proxy(target as any, {
    get(obj: any, prop: string | symbol) {
      const value = obj[prop];

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
  });
}

// More flexible types that work with GitHub API
type GitHubPaginatedFunction = (...args: any[]) => Promise<{ data: any[] }>;

function listAll<T extends GitHubPaginatedFunction>(fn: T) {
  return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>["data"]> => {
    let allData: any[] = [];
    let page = 1;
    const per_page = args[0]?.per_page || 100; // max per_page for GitHub API

    while (true) {
      // Clone the first argument (params) and add pagination
      const [firstArg, ...restArgs] = args;
      const paginatedParams = {
        ...firstArg,
        per_page,
        page,
      };

      const response = await fn(paginatedParams, ...restArgs);
      allData = allData.concat(response.data);
      if (response.data.length < per_page) break; // No more pages
      page++;
    }
    return allData as Awaited<ReturnType<T>>["data"];
  };
}

type DeepListAllWrapper<T> = {
  [K in keyof T]: T[K] extends GitHubPaginatedFunction
    ? ReturnType<typeof listAll<T[K]>>
    : T[K] extends object
      ? DeepListAllWrapper<T[K]>
      : T[K];
};

// Create a proxy that adds `.all` method to list methods
// Note: This is a simplified version and may need adjustments based on actual API patterns
function createListAllProxy<T extends object>(obj: T): DeepListAllWrapper<T> {
  return new Proxy(obj as any, {
    get(target, prop: string | symbol) {
      const value = target[prop];
      if (typeof value === "function" && prop.toString().startsWith("list")) {
        return Object.assign(value, { all: listAll(value) });
      } else if (typeof value === "object" && value !== null) {
        return createListAllProxy(value);
      }
      return value;
    },
  }) as DeepListAllWrapper<T>;
}

export async function clearGhCache(): Promise<void> {
  const keyvInstance = await getKeyv();
  await keyvInstance.clear();
}

export async function getGhCacheStats(): Promise<{ size: number; keys: string[] }> {
  // Note: Keyv doesn't provide built-in stats, but we can query the SQLite directly if needed
  // For now, return basic info
  return { size: 0, keys: [] };
}

export const ghc = createCachedProxy(gh);
export const ghca = createListAllProxy(ghc);
// ghca.repos.listActivities
// Export listAll for easy usage
export { listAll };

// manual test with real api
if (import.meta.main) {
  async function runTest() {
    // Test the cached client
    console.info("Testing cached GitHub client...");

    // This should make a real API call
    const result1 = await ghc.repos.get({
      owner: "octocat",
      repo: "Hello-World",
    });
    console.info("First call result", { name: result1.data.name });

    // This should use cache
    const result2 = await ghc.repos.get({
      owner: "octocat",
      repo: "Hello-World",
    });
    console.info("Second call result (cached)", { name: result2.data.name });

    // list all pull requests
    const allPRs = await listAll(ghc.pulls.list)({
      owner: "octocat",
      repo: "Hello-World",
      state: "all",
    });
    console.info(`Total PRs fetched with listAll(): ${allPRs.length}`);

    console.info("Cache test complete!");
  }

  runTest().catch((error) => console.error("Test failed", error));
}
