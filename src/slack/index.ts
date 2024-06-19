import { WebClient } from "@slack/web-api";
import DIE from "@snomiao/die";
export const slack = new WebClient(process.env.SLACK_BOT_TOKEN || DIE(new Error("missing env.SLACK_BOT_TOKEN")));
if (import.meta.main) {
  await slack.api.test({}); // test token
}
