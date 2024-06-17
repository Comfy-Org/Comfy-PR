import DIE from "@snomiao/die";
import { slack } from "./slack";

export async function postSlackMessage(text: string) {
  const channel = process.env.SLACK_BOT_CHANNEL || DIE(new Error("missing env.SLACK_BOT_CHANNEL"));
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
