import { WebClient } from "@slack/web-api";
import DIE from "@snomiao/die";

export const slack = new WebClient(
  process.env.SLACK_BOT_TOKEN || DIE("missing env.SLACK_BOT_TOKEN")
);
