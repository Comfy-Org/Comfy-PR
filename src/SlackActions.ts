import DIE from "@snomiao/die";
import { slack } from "./slack";

const channel =
  process.env.SLACK_BOT_CHANNEL || DIE("missing env.SLACK_BOT_CHANNEL");
if (import.meta.main) {
  await slack.conversations.history({ channel });
}
