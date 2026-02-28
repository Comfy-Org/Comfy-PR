import { afterEach, beforeAll } from "bun:test";
import chalk from "chalk";
import { setupServer } from "msw/node";
import { githubHandlers } from "./github-handlers";

// Set test token for GitHub client
if (!process.env.GH_TOKEN) {
  process.env.GH_TOKEN = "test-token-msw-setup";
}

// Create MSW server with GitHub API handlers
export const server = setupServer(...githubHandlers);

// Start server before all tests
beforeAll(() => {
  server.listen({
    onUnhandledRequest: "error",
  });
  console.log(chalk.bgRedBright("[MSW READY] All External Services API will be mocked"));
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Clean up when process exits (not per-file, to keep server alive across all test files)
process.on("beforeExit", () => {
  server.close();
});
