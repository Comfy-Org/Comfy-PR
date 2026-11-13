import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { createHash } from "crypto";
import Keyv from "keyv";
import { Octokit } from "octokit";

const OctokitWithPlugins = Octokit.plugin(retry, throttling);

export type OctokitOptions = {
  auth: string;
  maxRetries?: number;
};

type GithubResponse = Awaited<ReturnType<Octokit["request"]>>;

const ETAG_TTL = 7 * 24 * 60 * 60 * 1000;
let etagStore: Promise<Keyv<GithubResponse>> | undefined;

function getEtagStore(file: string) {
  etagStore ??= import("@keyv/sqlite").then(
    ({ default: KeyvSqlite }) =>
      new Keyv<GithubResponse>({
        store: new KeyvSqlite(`sqlite://${file}`),
        namespace: "gh-etag",
        ttl: ETAG_TTL,
      }),
  );
  return etagStore;
}

function isNotModified(error: unknown) {
  return (error as { status?: number })?.status === 304;
}

/**
 * Revalidates GET requests with stored ETags, so unchanged responses come back as
 * 304 Not Modified, which GitHub does not count against the rate limit.
 * Enabled by setting GH_ETAG_CACHE_FILE to a SQLite file path.
 */
function useEtagCache(octokit: InstanceType<typeof OctokitWithPlugins>, auth: string) {
  const file = process.env.GH_ETAG_CACHE_FILE;
  if (!file) return;
  const tokenId = createHash("sha256").update(auth).digest("hex").slice(0, 12);

  octokit.hook.wrap("request", async (request, options) => {
    if (options.method !== "GET") return request(options);

    const { url, headers } = octokit.request.endpoint(options);
    const key = `${tokenId} ${url} ${headers.accept}`;
    const store = await getEtagStore(file);
    const cached = await store.get(key);
    if (cached?.headers.etag) options.headers["if-none-match"] = cached.headers.etag;

    try {
      const response = await request(options);
      if (response.headers.etag) await store.set(key, response);
      return response;
    } catch (error) {
      if (cached && isNotModified(error)) return cached;
      throw error;
    }
  });
}

/**
 * Creates an Octokit instance with retry and throttling plugins configured
 * @param options Configuration options including auth token
 * @returns Configured Octokit instance
 */
export function createOctokit({ auth, maxRetries = 3 }: OctokitOptions) {
  const octokit = new OctokitWithPlugins({
    auth,
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
        if (retryCount < maxRetries) {
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(
          `SecondaryRateLimit detected for request ${options.method} ${options.url}`,
        );
      },
    },
    retry: {
      doNotRetry: ["429"], // Let throttling plugin handle rate limits
    },
  });
  useEtagCache(octokit, auth);
  return octokit;
}
