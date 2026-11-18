import type { WebClient } from "@slack/web-api";
import { getSlack, isSlackAvailable } from ".";

// Declared before the direct-run block below, which calls getSlackChannel.
type SlackClient = Pick<WebClient, "conversations">;
type SlackChannel = Awaited<ReturnType<typeof findSlackChannel>>;
const found = new WeakMap<SlackClient, Map<string, Promise<SlackChannel>>>();

if (import.meta.main) {
  if (isSlackAvailable()) {
    console.log(JSON.stringify(await getSlackChannel("general")));
  } else {
    console.log("Slack token not configured");
  }
}

/**
 * Find a public or private channel the bot can see by its current name.
 *
 * Reads every page of `conversations.list`. Archived channels are skipped, so
 * an archived channel is "not found" even though it keeps its name. A renamed
 * channel keeps its id but answers only to its new name. Either way the error
 * names the channel that was asked for.
 *
 * A successful lookup is remembered per client for the life of the process,
 * so a task that resolves the same channel many times (concurrently or not)
 * pages through the list once. A failed lookup is not remembered.
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export function getSlackChannel(name: string, slack: SlackClient = getSlack()) {
  let byName = found.get(slack);
  if (!byName) found.set(slack, (byName = new Map()));
  let lookup = byName.get(name);
  if (!lookup) {
    lookup = findSlackChannel(name, slack);
    const cache = byName;
    lookup.catch(() => cache.delete(name));
    cache.set(name, lookup);
  }
  return lookup;
}

async function findSlackChannel(name: string, slack: SlackClient) {
  let cursor: string | undefined;
  const seen = new Set<string>();
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
    if (cursor && seen.has(cursor))
      throw new Error(`Slack returned cursor ${cursor} twice while looking for #${name}`);
    if (cursor) seen.add(cursor);
  } while (cursor);
  throw new Error(
    `Slack channel #${name} not found: it may have been renamed or archived, or the bot cannot see it`,
  );
}
