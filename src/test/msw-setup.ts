import { afterAll, afterEach, beforeAll } from "bun:test";
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
    onUnhandledRequest: "warn",
  });
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => {
  server.close();
});
