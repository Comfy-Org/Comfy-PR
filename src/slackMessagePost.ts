import DIE from "@snomiao/die";
import { slack } from "./slack";

const channel =
  process.env.SLACK_BOT_CHANNEL || DIE("missing env.SLACK_BOT_CHANNEL");
export async function slackMessagePost(text: string) {
  // this api will auto retry if failed
  const response = await slack.chat.postMessage({
    channel,
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: text,
        },
      },
    ],
  });
  return { channel, ts: response.ts, text };
}
