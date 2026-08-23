import { http, HttpResponse } from "msw";

const SLACK_API_BASE = "https://slack.com/api";

/**
 * MSW handlers for the Slack Web API endpoints exercised by the test suite.
 *
 * `.env.test` sets a fake `SLACK_BOT_TOKEN` so that `isSlackAvailable()`
 * (lib/slack/index.ts) reports Slack as configured — this matches
 * production, where the bot always has a real token. That means any code
 * under test which checks `isSlackAvailable()` and then calls the Slack Web
 * API (e.g. `lib/slack/parseSlackMessageToMarkdown.ts` resolving `<@U…>` /
 * `<#C…>` mentions) will actually attempt a real HTTP request during tests.
 *
 * Without a matching handler here, MSW's `onUnhandledRequest: "error"`
 * strategy (see src/test/msw-setup.ts) throws for every such call. These
 * handlers respond with `ok: false`, which makes `@slack/web-api`'s
 * `WebClient` reject the call (it throws on `ok: false` responses) so
 * callers fall back to their "Slack unavailable / user or channel unknown"
 * paths deterministically, without hitting the real network.
 *
 * Individual tests can still override these with `server.use(...)` (see
 * lib/slack/avatar.spec.ts) when they need a specific successful response.
 */
export const slackHandlers = [
  // POST /api/users.info - Get information about a user
  http.post(`${SLACK_API_BASE}/users.info`, () => {
    return HttpResponse.json({ ok: false, error: "user_not_found" });
  }),

  // POST /api/conversations.info - Get information about a channel
  http.post(`${SLACK_API_BASE}/conversations.info`, () => {
    return HttpResponse.json({ ok: false, error: "channel_not_found" });
  }),
];
