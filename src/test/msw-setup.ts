import { afterAll, afterEach, beforeAll } from "bun:test";
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

// Clean up after all tests
afterAll(async () => {
  server.close();

  // Close database connection if it was imported
  try {
    const { db } = await import("@/src/db");
    await db.close();
    console.log(chalk.green("[CLEANUP] Database connection closed"));
  } catch (error) {
    // db module might not have been imported, which is fine
    console.log(chalk.yellow("[CLEANUP] No database connection to close"));
  }
});
