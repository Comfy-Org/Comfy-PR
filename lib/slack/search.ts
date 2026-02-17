#!/usr/bin/env bun
import { slack } from "@/lib";
import sflow from "sflow";
import { parseArgs } from "util";
import yaml from "yaml";
import { parseSlackMessageToMarkdown } from "./parseSlackMessageToMarkdown";
import { slackTsToISO } from "./slackTsToISO";

/**
 * Search messages across workspace
 */
export async function searchMessages(
  query: string,
  options: {
    channel?: string;
    limit?: number;
    sort?: "score" | "timestamp";
    sortDir?: "asc" | "desc";
  } = {},
) {
  try {
    const searchParams = {
      query,
      count: options.limit || 20,
      sort: (options.sort || "timestamp") as "score" | "timestamp",
      sort_dir: (options.sortDir || "desc") as "asc" | "desc",
    };

    const result = await slack.search.messages(searchParams);

    if (!result.ok) {
      throw new Error(`Failed to search messages: ${result.error || "unknown error"}`);
    }

    const messages = result.messages?.matches || [];

    // Filter by channel if specified
    type SlackMessage = {
      channel?: { id?: string; name?: string };
      user?: string;
      ts?: string;
      text?: string;
      permalink?: string;
      score?: number;
      reactions?: Array<{ name?: string; count?: number }>;
    };

    const filteredMessages = options.channel
      ? (messages as SlackMessage[]).filter((m) => m.channel?.id === options.channel)
      : (messages as SlackMessage[]);

    // Format results
    const formattedResults = await sflow(filteredMessages)
      .map(async (match: SlackMessage) => {
        const channelName = match.channel?.name || match.channel?.id || "unknown";

        // Get user info
        const userName = match.user
          ? await slack.users
              .info({ user: match.user })
              .then((res) => res.user?.name || match.user)
              .catch(() => match.user)
          : "unknown";

        return {
          channel: match.channel?.id || "unknown",
          channel_name: channelName,
          ts: match.ts,
          iso: match.ts ? slackTsToISO(match.ts) : undefined,
          user: match.user || "unknown",
          username: userName,
          text: match.text || "",
          markdown: await parseSlackMessageToMarkdown(match.text || ""),
          permalink: match.permalink,
          score: match.score,
          ...(match.reactions &&
            match.reactions.length > 0 && {
              reactions: match.reactions.map((r) => ({
                name: r.name,
                count: r.count,
              })),
            }),
        };
      })
      .toArray();

    return {
      query,
      total_results: result.messages?.total || 0,
      results_returned: formattedResults.length,
      matches: formattedResults,
    };
  } catch (error) {
    console.error("Error searching messages:", error);
    throw error;
  }
}

/**
 * Search files across workspace
 */
export async function searchFiles(
  query: string,
  options: {
    limit?: number;
    sort?: "score" | "timestamp";
    sortDir?: "asc" | "desc";
  } = {},
) {
  try {
    const searchParams = {
      query,
      count: options.limit || 20,
      sort: (options.sort || "timestamp") as "score" | "timestamp",
      sort_dir: (options.sortDir || "desc") as "asc" | "desc",
    };

    const result = await slack.search.files(searchParams);

    if (!result.ok) {
      throw new Error(`Failed to search files: ${result.error || "unknown error"}`);
    }

    const files = result.files?.matches || [];

    // Format results
    type SlackFile = {
      id?: string;
      name?: string;
      title?: string;
      mimetype?: string;
      size?: number;
      url_private?: string;
      permalink?: string;
      created?: number;
      user?: string;
      score?: number;
    };

    const formattedResults = (files as SlackFile[]).map((file) => ({
      id: file.id,
      name: file.name,
      title: file.title,
      mimetype: file.mimetype,
      size: file.size,
      url_private: file.url_private,
      permalink: file.permalink,
      created: file.created,
      user: file.user,
      score: file.score,
    }));

    return {
      query,
      total_results: result.files?.total || 0,
      results_returned: formattedResults.length,
      matches: formattedResults,
    };
  } catch (error) {
    console.error("Error searching files:", error);
    throw error;
  }
}

// CLI usage
if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      query: {
        type: "string",
        short: "q",
      },
      channel: {
        type: "string",
        short: "c",
      },
      limit: {
        type: "string",
        short: "l",
        default: "20",
      },
      type: {
        type: "string",
        short: "t",
        default: "messages",
      },
      sort: {
        type: "string",
        default: "timestamp",
      },
      sortDir: {
        type: "string",
        default: "desc",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values.query) {
    console.error("Usage: bun lib/slack/search.ts --query <query> [options]");
    console.error("\nOptions:");
    console.error("  -q, --query <query>       Search query (required)");
    console.error("  -c, --channel <channel>   Filter by channel ID");
    console.error("  -l, --limit <number>      Max results (default: 20)");
    console.error("  -t, --type <type>         Search type: messages|files (default: messages)");
    console.error("  --sort <field>            Sort by: score|timestamp (default: timestamp)");
    console.error("  --sortDir <dir>           Sort direction: asc|desc (default: desc)");
    console.error("\nExamples:");
    console.error('  bun lib/slack/search.ts -q "authentication bug" -l 10');
    console.error('  bun lib/slack/search.ts -q "report.pdf" -t files');
    process.exit(1);
  }

  const limit = parseInt(values.limit || "20");
  const searchType = values.type === "files" ? "files" : "messages";

  let results;
  if (searchType === "files") {
    results = await searchFiles(values.query, {
      limit,
      sort: values.sort as "score" | "timestamp",
      sortDir: values.sortDir as "asc" | "desc",
    });
  } else {
    results = await searchMessages(values.query, {
      channel: values.channel,
      limit,
      sort: values.sort as "score" | "timestamp",
      sortDir: values.sortDir as "asc" | "desc",
    });
  }

  console.log(yaml.stringify(results));
}
