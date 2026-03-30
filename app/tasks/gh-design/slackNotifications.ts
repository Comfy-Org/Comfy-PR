import { getSlack } from "@/lib/slack";
import { getSlackChannel } from "@/lib/slack/channels";

export type GithubDesignSlackItem = {
  url: string;
  title: string;
  user: string;
  state: "open" | "approved" | "closed" | "merged";
  type: "issue" | "pull_request";
};

type SlackSearchMatch = {
  channel?: {
    id?: string | null;
  } | null;
  permalink?: string | null;
  text?: string | null;
  ts?: string | null;
};

export function buildDesignRootSlackText(item: GithubDesignSlackItem) {
  return `🎨 *New Design ${item.type}*: ${item.state.toUpperCase()} <${item.url}|${item.title}> by <https://github.com/${item.user}|@${item.user}>`;
}

export function buildDesignCommentActivitySlackText(
  item: Pick<GithubDesignSlackItem, "type" | "title" | "url">,
  previousComments: number,
  nextComments: number,
) {
  const itemType = item.type === "pull_request" ? "PR" : "issue";
  const noun = nextComments === 1 ? "comment" : "comments";
  const delta = nextComments - previousComments;
  const deltaSuffix = delta > 0 ? ` (+${delta})` : "";
  return `💬 Design ${itemType} discussion updated: <${item.url}|${item.title}> now has ${nextComments} ${noun}${deltaSuffix}.`;
}

export function planDesignCommentNotification(
  previousNotifiedComments: number | undefined,
  nextComments: number | undefined,
) {
  if (nextComments === undefined) {
    return {
      shouldReplyInThread: false,
      nextNotifiedComments: previousNotifiedComments,
    };
  }

  if (previousNotifiedComments === undefined) {
    return {
      shouldReplyInThread: false,
      nextNotifiedComments: nextComments,
    };
  }

  if (nextComments > previousNotifiedComments) {
    return {
      shouldReplyInThread: true,
      nextNotifiedComments: nextComments,
    };
  }

  return {
    shouldReplyInThread: false,
    nextNotifiedComments: nextComments,
  };
}

export function selectLatestDesignSlackRootMessage(
  matches: SlackSearchMatch[],
  channelId: string,
  githubUrl: string,
) {
  return [...matches]
    .filter(
      (match) =>
        match.channel?.id === channelId &&
        !!match.permalink &&
        !!match.text?.includes(githubUrl) &&
        !!match.text?.includes("New Design"),
    )
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))[0];
}

export async function findLatestDesignSlackRootMessage({
  channelName,
  githubUrl,
}: {
  channelName: string;
  githubUrl: string;
}) {
  const slack = getSlack();
  const channel = await getSlackChannel(channelName);
  const result = await slack.search.messages({
    query: `"${githubUrl}" "New Design"`,
    count: 20,
    sort: "timestamp",
    sort_dir: "desc",
  });
  if (!result.ok) {
    throw new Error(`Failed to search Slack for existing design message: ${result.error}`);
  }
  const match = selectLatestDesignSlackRootMessage(
    (result.messages?.matches as SlackSearchMatch[] | undefined) ?? [],
    channel.id || "",
    githubUrl,
  );
  if (!match?.permalink || !channel.id) return undefined;
  return {
    channel: channel.id,
    url: match.permalink,
    ts: match.ts || undefined,
  };
}
