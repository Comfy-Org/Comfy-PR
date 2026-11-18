import type { WebClient } from "@slack/web-api";
import { getSlack, isSlackAvailable } from ".";

if (import.meta.main) {
  if (isSlackAvailable()) {
    console.log(JSON.stringify(await getSlackChannel("general")));
  } else {
    console.log("Slack token not configured");
  }
}

type SlackChannel = Awaited<ReturnType<typeof findSlackChannel>>;
const found = new Map<string, Promise<SlackChannel>>();

/**
 * Find a public or private channel the bot can see by its current name.
 *
 * Reads every page of `conversations.list`. Archived channels are skipped, so
 * an archived channel is "not found" even though it keeps its name. A renamed
 * channel keeps its id but answers only to its new name. Either way the error
 * names the channel that was asked for.
 *
 * A successful lookup is remembered for the life of the process, so a task
 * that resolves the same channel many times pages through the list once.
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export function getSlackChannel(name: string, slack?: Pick<WebClient, "conversations">) {
  if (slack) return findSlackChannel(name, slack);
  let lookup = found.get(name);
  if (!lookup) {
    lookup = findSlackChannel(name, getSlack());
    lookup.catch(() => found.delete(name));
    found.set(name, lookup);
  }
  return lookup;
}

async function findSlackChannel(name: string, slack: Pick<WebClient, "conversations">) {
  let cursor: string | undefined;
  do {
    const page = await slack.conversations.list({
      types: "public_channel,private_channel",
      // Slack recommends no more than 200 per page; the cursor covers the rest.
      limit: 200,
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
