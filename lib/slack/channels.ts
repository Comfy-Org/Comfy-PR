import type { WebClient } from "@slack/web-api";
import { getSlack, isSlackAvailable } from ".";

if (import.meta.main) {
  if (isSlackAvailable()) {
    console.log(JSON.stringify(await getSlackChannel("general")));
  } else {
    console.log("Slack token not configured");
  }
}

/**
 * Find a public or private channel the bot can see by its current name.
 * Reads every page of `conversations.list`, and throws an error naming the
 * channel when there is no match (a renamed or archived channel keeps its id
 * but not its name).
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export async function getSlackChannel(
  name: string,
  slack: Pick<WebClient, "conversations"> = getSlack(),
) {
  let cursor: string | undefined;
  do {
    const page = await slack.conversations.list({
      types: "public_channel,private_channel",
      limit: 1000,
      exclude_archived: true,
      ...(cursor && { cursor }),
    });
    const ch = page.channels?.find((c) => c.name === name);
    if (ch) return { ...ch, url: `https://slack.com/app_redirect?channel=${ch.id}` };
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);
  throw new Error(
    `Slack channel #${name} not found: it may have been renamed or archived, or the bot cannot see it`,
  );
}
