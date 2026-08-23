import { afterAll, afterEach, beforeAll } from "bun:test";
import chalk from "chalk";
import { setupServer } from "msw/node";
import { githubHandlers } from "./github-handlers";
import { slackHandlers } from "./slack-handlers";

// Set test token for GitHub client
if (!process.env.GH_TOKEN) {
  process.env.GH_TOKEN = "test-token-msw-setup";
}

// Create MSW server with GitHub and Slack API handlers
export const server = setupServer(...githubHandlers, ...slackHandlers);

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

// Clean up after all tests
afterAll(() => {
  server.close();
});
