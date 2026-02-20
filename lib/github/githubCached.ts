import KeyvSqlite from "@keyv/sqlite";
import type { components as ghComponents } from "@octokit/openapi-types";
import * as crypto from "crypto";
import { promises as fs } from "fs";
import Keyv from "keyv";
import * as path from "path";
import { createOctokit } from "@/lib/github/createOctokit";

const GH_TOKEN =
  process.env.GH_TOKEN_COMFY_PR ||
  process.env.GH_TOKEN ||
  "WARNING: missing env.GH_TOKEN from https://github.com/settings/tokens?type=beta";

const octokit = createOctokit({ auth: GH_TOKEN });

export const gh = octokit.rest;

export type GH = ghComponents["schemas"];

// Use a cache directory that works from unknown working directory
// Priority: 1) Project's node_modules if it exists, 2) Temp directory
function getCacheDir(): string {
  const projectCache = path.join(process.cwd(), "node_modules/.cache/Comfy-PR");
  const tempCache = path.join(require("os").tmpdir(), ".cache/Comfy-PR");

  // Try to use project cache if node_modules exists
  try {
    const nodeModulesPath = path.join(process.cwd(), "node_modules");
    if (require("fs").existsSync(nodeModulesPath)) {
      return projectCache;
    }
  } catch {
    // Fall through to temp cache
  }

  return tempCache;
}

const CACHE_DIR = getCacheDir();
const CACHE_FILE = path.join(CACHE_DIR, "gh-cache.sqlite");
const DEFAULT_TTL = process.env.LOCAL_DEV
  ? 30 * 60 * 1000 // cache 30 minutes when local dev
  : 1 * 60 * 1000; // cache 1 minute in production

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error: unknown) {
    // Ignore errors if directory already exists or can't be created
    // This prevents crashes when running from different working directories
    const err = error as Error & { code?: string };
    if (err.code !== "EEXIST") {
      console.warn(`Warning: Could not create cache directory ${CACHE_DIR}:`, err.message);
    }
  }
}

let keyv: Keyv | null = null;

async function getKeyv() {
  if (!keyv) {
    await ensureCacheDir();
    try {
      keyv = new Keyv({
        store: new KeyvSqlite(CACHE_FILE),
        ttl: DEFAULT_TTL,
      });
    } catch (_error: unknown) {
      // If SQLite fails, silently fall back to in-memory cache
      // This is expected when running from directories without write access
      keyv = new Keyv({
        ttl: DEFAULT_TTL,
      });
    }
  }
  return keyv;
}

function createCacheKey(basePath: string[], prop: string | symbol, args: unknown[]): string {
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

function createCachedProxy(target: object, basePath: string[] = []): unknown {
  return new Proxy(target as Record<string | symbol, unknown>, {
    get(obj: Record<string | symbol, unknown>, prop: string | symbol) {
      const value = obj[prop];

      if (typeof value === "function") {
        return async function (...args: unknown[]) {
          const cacheKey = createCacheKey(basePath, prop, args);
          const keyvInstance = await getKeyv();

          // Try to get from cache first
          const cached = await keyvInstance.get(cacheKey);
          if (cached !== undefined) {
            // logger.debug(`Cache hit`, { cacheKey }); // cache hit info for debug
            return cached;
          }

          // Call the original function
          const result = await (value as (...args: unknown[]) => unknown).apply(obj, args);

          // Cache the result
          await keyvInstance.set(cacheKey, result);

          return result;
        };
      } else if (typeof value === "object" && value !== null) {
        // Recursively wrap nested objects
        return createCachedProxy(value as object, [...basePath, prop.toString()]);
      }

      return value;
    },
  });
}

// Simplified type - avoid expensive recursive type computation
// The proxy already handles the async wrapping at runtime
export const ghc = createCachedProxy(gh) as typeof gh;

export async function clearGhCache(): Promise<void> {
  const keyvInstance = await getKeyv();
  await keyvInstance.clear();
}

export async function getGhCacheStats(): Promise<{ size: number; keys: string[] }> {
  // Note: Keyv doesn't provide built-in stats, but we can query the SQLite directly if needed
  // For now, return basic info
  return { size: 0, keys: [] };
}

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

    console.info("Cache test complete!");
  }

  runTest().catch((error) => console.error("Test failed", error));
}
