import sflow from "sflow";
import { getSlack, isSlackAvailable } from ".";

if (import.meta.main) {
  if (isSlackAvailable()) {
    console.log(JSON.stringify(await getSlackChannel("general")));
  } else {
    console.log("Slack token not configured");
  }
}

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export async function getSlackChannel(name: string) {
  const slack = getSlack();
  return await sflow(
    slack.conversations.list({
      types: "public_channel,private_channel",
      limit: 1000,
    }),
  )
    .map((e) => e.channels)
    .filter()
    .flat()
    .filter((ch) => ch.name === name)
    .mapAddField("url", (ch) => `https://slack.com/app_redirect?channel=${ch.id}`)
    // .forEach(channel => {
    //   console.log(`Channel: ${channel.name} (${channel.id})`);
    //   console.log(`URL: ${channel.url}`);
    // })
    .toAtLeastOne();
}
