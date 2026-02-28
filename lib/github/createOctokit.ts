import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "octokit";

const OctokitWithPlugins = Octokit.plugin(retry, throttling);

export type OctokitOptions = {
  auth: string;
  maxRetries?: number;
};

/**
 * Creates an Octokit instance with retry and throttling plugins configured
 * @param options Configuration options including auth token
 * @returns Configured Octokit instance
 */
export function createOctokit({ auth, maxRetries = 3 }: OctokitOptions) {
  return new OctokitWithPlugins({
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
      doNotRetry: [400, 401, 403, 404, 422, 429], // 429 handled by throttling plugin
    },
  });
}
