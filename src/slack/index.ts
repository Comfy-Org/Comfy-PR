import { WebClient } from "@slack/web-api";

let slackClient: WebClient | null = null;

export function getSlack(): WebClient {
  if (!slackClient) {
    const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN?.trim();
    if (!SLACK_BOT_TOKEN) {
      throw new Error("Missing env.SLACK_BOT_TOKEN - Slack functionality is unavailable");
    }
    slackClient = new WebClient(SLACK_BOT_TOKEN);
  }
  return slackClient;
}

export function isSlackAvailable(): boolean {
  return !!process.env.SLACK_BOT_TOKEN?.trim();
}

export const slack = new Proxy({} as WebClient, {
  get(_target, prop) {
    // console.warn("Direct access to 'slack' is deprecated. Use getSlack() instead.");
    const client = getSlack();
    return (client as any)[prop];
  },
});

if (import.meta.main) {
  if (isSlackAvailable()) {
    await slack.api.test({}); // test token
    console.log("Slack API token is valid.");
  } else {
    console.log("Slack API token not configured.");
  }
}
