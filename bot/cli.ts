#!/usr/bin/env bun

import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

// GitHub abilities
import { spawnSubAgent } from "./code/pr-agent";
import { searchGitHubIssues } from "./code/issue-search";

// Registry ability
import { searchRegistryNodes } from "@/lib/registry/search";

// Slack abilities
import {
  downloadSlackFile,
  getSlackFileInfo,
  postMessageWithFiles,
  uploadSlackFile,
} from "@/lib/slack/file";
import { readNearbyMessages } from "@/lib/slack/msg-read-nearby";
import { readRecentMessages } from "@/lib/slack/msg-read-recent";
import { readSlackThread } from "@/lib/slack/msg-read-thread";
import { updateSlackMessage } from "@/lib/slack/msg-update";
import { smartPost } from "@/lib/slack/msg-post";
import { parseSlackUrl } from "@/lib/slack/parseSlackUrl";
import { parseSlackUrlSmart } from "@/lib/slack/parseSlackUrlSmart";
import { getMessageReactions } from "@/lib/slack/reactions";
import { searchMessages, searchFiles } from "@/lib/slack/search";
import { listPinnedMessages } from "@/lib/slack/pins";
import { listChannelBookmarks } from "@/lib/slack/bookmarks";
import { getMessagePermalink } from "@/lib/slack/permalink";
import { getChannelInfo } from "@/lib/slack/channel-info";
import { listChannelMembers } from "@/lib/slack/members";
import { getUserPresence, getBulkUserPresence } from "@/lib/slack/presence";
import { getCompleteMessageContext } from "@/lib/slack/context";
import yaml from "yaml";

// Notion ability
import { searchNotion } from "@/lib/notion/search";
import { fetchPeopleMappings, findSlackIdByGithubUsername } from "@/lib/notion/people";

// Video ability
import { readVideo } from "@/lib/video/read-video";

// Feedback ability
import { postFeedback, type FeedbackType } from "@/lib/slack/feedback";

/**
 * Load environment variables from .env.local in the project root
 * This allows prbot to work from unknown directory
 */
async function loadEnvLocal() {
  const envPath = path.join(import.meta.dir, "../.env.local");

  try {
    const envFile = await Bun.file(envPath).text();
    envFile.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^["']|["']$/g, "");
          process.env[key.trim()] = value;
        }
      }
    });
  } catch (_e) {
    // .env.local doesn't exist or can't be read, continue anyway
  }
}

/**
 * Handle PR command with auto-generated branch names
 */
async function handlePrCommand(args: {
  repo: string;
  base?: string;
  head?: string;
  prompt: string;
}) {
  const { repo, base = "main", head, prompt } = args;

  // Import here to avoid circular dependencies
  const zChatCompletion = (await import("../lib/zChat")).default;
  const z = (await import("zod")).default;

  let finalHead = head;
  let finalBase = base;

  // Auto-generate head branch if not provided
  if (!finalHead) {
    console.log("Generating head branch name from prompt...");
    const branchInfo = (await zChatCompletion(
      z.object({
        base: z.string(),
        head: z.string(),
      }),
      {
        model: "gpt-4o-mini",
      },
    )`Generate a git branch name following conventions:
- Format: <type>/<description>
- Types: feature/, fix/, refactor/, docs/, test/, chore/
- Description: kebab-case, short and descriptive

Base: ${finalBase}
Task: ${prompt}

Generate branch name.`) as { base: string; head: string };
    finalBase = branchInfo.base;
    finalHead = branchInfo.head;
    console.log(`Generated head branch: ${finalHead}`);
  }

  await spawnSubAgent({
    repo,
    base: finalBase,
    head: finalHead as string,
    prompt,
  });
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .scriptName("prbot")
    .usage("$0 <command> [options]")
    .command(
      "code pr",
      "Open an interactive coding sub-agent and automatically create a PR",
      (y) =>
        y
          .option("repo", {
            alias: "r",
            type: "string",
            describe: "owner/repo (e.g. Comfy-Org/ComfyUI)",
            demandOption: true,
          })
          .option("base", {
            type: "string",
            describe: "Base branch to merge into (defaults to main)",
            default: "main",
          })
          .option("head", {
            type: "string",
            describe: "Head branch to develop on (auto-generated if not provided)",
          })
          .option("prompt", {
            alias: "p",
            type: "string",
            describe: "Task prompt for the coding agent",
            demandOption: true,
          }),
      async (args) => {
        await handlePrCommand({
          repo: args.repo as string,
          base: args.base as string | undefined,
          head: args.head as string | undefined,
          prompt: args.prompt as string,
        });
      },
    )
    .command(
      "code search",
      "Search ComfyUI code using comfy-codesearch service",
      (y) =>
        y
          .option("query", {
            alias: "q",
            type: "string",
            describe: "Search query (supports repo: and path: filters)",
            demandOption: true,
          })
          .option("repo", {
            type: "string",
            describe: "Filter by repository (e.g. Comfy-Org/ComfyUI)",
          })
          .option("path", {
            type: "string",
            describe: "Filter by file path pattern",
          }),
      async (args) => {
        await loadEnvLocal();

        let query = args.query as string;
        if (args.repo) {
          query = `repo:${args.repo} ${query}`;
        }
        if (args.path) {
          query = `path:${args.path} ${query}`;
        }

        const { $ } = await import("bun");
        const result = await $`comfy-codesearch ${query}`.quiet();
        console.log(result.stdout.toString());
      },
    )
    .command(
      "github-issue search",
      "Search for issues across Comfy-Org repositories",
      (y) =>
        y
          .option("query", {
            alias: "q",
            type: "string",
            describe: "Search query",
            demandOption: true,
          })
          .option("limit", {
            alias: "l",
            type: "number",
            describe: "Maximum number of results",
            default: 10,
          }),
      async (args) => {
        await loadEnvLocal();
        const results = await searchGitHubIssues(
          args.query as string,
          (args.limit as number) ?? 10,
        );

        console.log(`Found ${results.length} results for: "${args.query}"\n`);

        for (const issue of results) {
          console.log(`#${issue.number} - ${issue.title}`);
          console.log(`  Repository: ${issue.repository}`);
          console.log(`  State: ${issue.state}`);
          console.log(`  Type: ${issue.is_pull_request ? "Pull Request" : "Issue"}`);
          console.log(`  Author: ${issue.user}`);
          if (issue.labels.length > 0) {
            console.log(`  Labels: ${issue.labels.join(", ")}`);
          }
          console.log(`  URL: ${issue.url}`);
          console.log(`  Updated: ${issue.updated_at}`);
          console.log("---");
        }
      },
    )
    .command(
      "github pr",
      "Open an interactive coding sub-agent and propose a PR",
      (y) =>
        y
          .option("repo", {
            alias: "r",
            type: "string",
            describe: "owner/repo (e.g. Comfy-Org/ComfyUI)",
            demandOption: true,
          })
          .option("base", {
            type: "string",
            describe: "Base branch to merge into (defaults to main)",
            default: "main",
          })
          .option("head", {
            type: "string",
            describe: "Head branch to develop on (auto-generated if not provided)",
          })
          .option("prompt", {
            alias: "p",
            type: "string",
            describe: "Task prompt for the coding agent",
            demandOption: true,
          }),
      async (args) => {
        await handlePrCommand({
          repo: args.repo as string,
          base: args.base as string | undefined,
          head: args.head as string | undefined,
          prompt: args.prompt as string,
        });
      },
    )
    .command(
      ["pr", "prbot"],
      "Alias of code pr",
      (y) =>
        y
          .option("repo", { alias: "r", type: "string", demandOption: true })
          .option("base", { type: "string", default: "main" })
          .option("head", { type: "string" })
          .option("prompt", { alias: "p", type: "string", demandOption: true }),
      async (args) => {
        await handlePrCommand({
          repo: args.repo as string,
          base: args.base as string | undefined,
          head: args.head as string | undefined,
          prompt: args.prompt as string,
        });
      },
    )
    .command("slack", "Slack integration commands", (yargs) => {
      return yargs
        .command(
          "read <url>",
          "Smart read: Auto-detect URL type (message/file/channel) and read appropriately (YAML output)",
          (y) =>
            y.positional("url", {
              type: "string",
              describe: "Slack URL (message, file, or channel)",
              demandOption: true,
            }),
          async (args) => {
            await loadEnvLocal();

            const url = args.url as string;
            const parsed = parseSlackUrlSmart(url);

            switch (parsed.type) {
              case "message": {
                // Read nearby messages with target highlighted
                const messages = await readNearbyMessages(
                  parsed.channel!,
                  parsed.ts!,
                  20, // 20 before
                  20, // 20 after
                );
                console.log(yaml.stringify(messages));
                break;
              }

              case "channel": {
                // Read recent 10 messages
                const messages = await readRecentMessages(parsed.channel!, 10);
                console.log(yaml.stringify(messages));
                break;
              }

              case "file": {
                // Download file to current directory
                if (!parsed.fileId) {
                  console.error("Could not extract file ID from URL");
                  process.exit(1);
                }

                const fileInfo = await getSlackFileInfo(parsed.fileId);
                const fileName = fileInfo.name || `file-${parsed.fileId}`;
                const outputPath = `./${fileName}`;

                await downloadSlackFile(parsed.fileId, outputPath);

                console.log(
                  yaml.stringify({
                    type: "file_downloaded",
                    file_id: parsed.fileId,
                    file_name: fileName,
                    file_size: fileInfo.size,
                    downloaded_to: outputPath,
                  }),
                );
                break;
              }

              default:
                console.error(`Unknown or unsupported Slack URL type: ${url}`);
                console.error("Supported formats:");
                console.error("  - Message: https://workspace.slack.com/archives/C123/p1234567890");
                console.error("  - Channel: https://workspace.slack.com/archives/C123");
                console.error("  - File: https://files.slack.com/files-pri/T123-F456/file.pdf");
                process.exit(1);
            }
          },
        )
        .command(
          "update",
          "Update a Slack message",
          (y) =>
            y
              .option("channel", { alias: "c", type: "string", demandOption: true })
              .option("ts", { alias: "t", type: "string", demandOption: true })
              .option("text", { alias: "m", type: "string", demandOption: true }),
          async (args) => {
            await loadEnvLocal();
            await updateSlackMessage(
              args.channel as string,
              args.ts as string,
              args.text as string,
            );
          },
        )
        .command(
          "post",
          "Smart-post: short text as a message, long markdown as a file upload (auto-detected at 2900 chars)",
          (y) =>
            y
              .option("channel", {
                alias: "c",
                type: "string",
                demandOption: true,
                describe: "Channel ID",
              })
              .option("text", {
                alias: "m",
                type: "string",
                describe: "Text to post (or omit to read --file)",
              })
              .option("file", {
                alias: "f",
                type: "string",
                describe: "File path to read content from",
              })
              .option("title", { type: "string", describe: "Title used when uploading as a file" })
              .option("comment", { type: "string", describe: "Comment to accompany file upload" })
              .option("thread", {
                alias: "t",
                type: "string",
                describe: "Thread timestamp to reply in",
              })
              .check((argv) => {
                if (!argv.text && !argv.file)
                  throw new Error("Either --text or --file is required");
                return true;
              }),
          async (args) => {
            await loadEnvLocal();
            let text = args.text as string | undefined;
            if (!text && args.file) {
              text = await Bun.file(args.file as string).text();
            }
            const result = await smartPost(args.channel as string, text!, {
              threadTs: args.thread as string | undefined,
              title: args.title as string | undefined,
              filePath: args.file as string | undefined,
              comment: args.comment as string | undefined,
            });
            if (result.method === "message") {
              console.log(`Posted as message (ts: ${result.ts})`);
            } else {
              console.log(`Uploaded as file: ${result.fileUrl}`);
            }
          },
        )
        .command(
          "read-thread",
          "Read and print a Slack thread (YAML)",
          (y) =>
            y
              .option("url", { alias: "u", type: "string", describe: "Slack message URL" })
              .option("channel", { alias: "c", type: "string", describe: "Slack channel ID" })
              .option("ts", { alias: "t", type: "string", describe: "Thread timestamp" })
              .option("limit", {
                alias: "l",
                type: "number",
                default: 100,
                describe: "Max messages",
              })
              .check((argv) => {
                // Require either URL or (channel + ts)
                if (!argv.url && (!argv.channel || !argv.ts)) {
                  throw new Error("Either --url or both --channel and --ts are required");
                }
                if (argv.url && (argv.channel || argv.ts)) {
                  throw new Error("Cannot use --url with --channel or --ts");
                }
                return true;
              }),
          async (args) => {
            await loadEnvLocal();

            let channel: string;
            let ts: string;

            // Parse from URL if provided
            if (args.url) {
              const parsed = parseSlackUrl(args.url as string);
              if (!parsed) {
                console.error("Failed to parse Slack URL. Please check the format.");
                process.exit(1);
              }
              channel = parsed.channel;
              ts = parsed.ts;
            } else {
              // Use channel and ts directly
              channel = args.channel as string;
              ts = args.ts as string;
            }

            const items = await readSlackThread(channel, ts, (args.limit as number) ?? 100);
            console.log(yaml.stringify(items));
          },
        )
        .command(
          "read-nearby",
          "Read nearby messages around a specific timestamp in a Slack channel",
          (y) =>
            y
              .option("url", { alias: "u", type: "string", describe: "Slack message URL" })
              .option("channel", { alias: "c", type: "string", describe: "Slack channel ID" })
              .option("ts", { alias: "t", type: "string", describe: "Message timestamp" })
              .option("before", {
                alias: "b",
                type: "number",
                default: 10,
                describe: "Messages before",
              })
              .option("after", {
                alias: "a",
                type: "number",
                default: 10,
                describe: "Messages after",
              })
              .check((argv) => {
                // Require either URL or (channel + ts)
                if (!argv.url && (!argv.channel || !argv.ts)) {
                  throw new Error("Either --url or both --channel and --ts are required");
                }
                if (argv.url && (argv.channel || argv.ts)) {
                  throw new Error("Cannot use --url with --channel or --ts");
                }
                return true;
              }),
          async (args) => {
            await loadEnvLocal();

            let channel: string;
            let ts: string;

            // Parse from URL if provided
            if (args.url) {
              const parsed = parseSlackUrl(args.url as string);
              if (!parsed) {
                console.error("Failed to parse Slack URL. Please check the format.");
                process.exit(1);
              }
              channel = parsed.channel;
              ts = parsed.ts;
            } else {
              // Use channel and ts directly
              channel = args.channel as string;
              ts = args.ts as string;
            }

            const items = await readNearbyMessages(
              channel,
              ts,
              (args.before as number) ?? 10,
              (args.after as number) ?? 10,
            );
            console.log(yaml.stringify(items));
          },
        )
        .command(
          "download-file",
          "Download a file from Slack",
          (y) =>
            y
              .option("fileId", {
                alias: "f",
                type: "string",
                demandOption: true,
                describe: "Slack file ID",
              })
              .option("output", {
                alias: "o",
                type: "string",
                demandOption: true,
                describe: "Output file path",
              }),
          async (args) => {
            await loadEnvLocal();
            await downloadSlackFile(args.fileId as string, args.output as string);
          },
        )
        .command(
          "file-info",
          "Get information about a Slack file (YAML)",
          (y) =>
            y.option("fileId", {
              alias: "f",
              type: "string",
              demandOption: true,
              describe: "Slack file ID",
            }),
          async (args) => {
            await loadEnvLocal();
            const info = await getSlackFileInfo(args.fileId as string);
            console.log(yaml.stringify(info));
          },
        )
        .command(
          "post-with-files",
          "Post a message with file attachments",
          (y) =>
            y
              .option("channel", {
                alias: "c",
                type: "string",
                demandOption: true,
                describe: "Channel ID",
              })
              .option("text", {
                alias: "m",
                type: "string",
                demandOption: true,
                describe: "Message text",
              })
              .option("file", {
                alias: "f",
                type: "array",
                demandOption: true,
                describe: "File path(s) to attach",
              })
              .option("thread", {
                alias: "t",
                type: "string",
                describe: "Thread timestamp to reply in",
              }),
          async (args) => {
            await loadEnvLocal();
            const files = (args.file as string[]).filter((f) => typeof f === "string");
            await postMessageWithFiles(
              args.channel as string,
              args.text as string,
              files,
              args.thread as string | undefined,
            );
          },
        )
        .command(
          "upload-file",
          "Upload a file to Slack",
          (y) =>
            y
              .option("channel", {
                alias: "c",
                type: "string",
                demandOption: true,
                describe: "Channel ID",
              })
              .option("file", {
                alias: "f",
                type: "string",
                demandOption: true,
                describe: "File path to upload",
              })
              .option("title", { type: "string", describe: "File title" })
              .option("comment", { alias: "m", type: "string", describe: "Initial comment" })
              .option("thread", {
                alias: "t",
                type: "string",
                describe: "Thread timestamp to reply in",
              }),
          async (args) => {
            await loadEnvLocal();
            await uploadSlackFile(args.channel as string, args.file as string, {
              title: args.title as string | undefined,
              initialComment: args.comment as string | undefined,
              threadTs: args.thread as string | undefined,
            });
          },
        )
        .command(
          "reactions <url>",
          "Get reactions for a message",
          (y) =>
            y.positional("url", {
              type: "string",
              describe: "Slack message URL",
              demandOption: true,
            }),
          async (args) => {
            await loadEnvLocal();
            const parsed = parseSlackUrl(args.url as string);
            if (!parsed) {
              console.error("Invalid Slack message URL");
              process.exit(1);
            }
            const reactions = await getMessageReactions(parsed.channel, parsed.ts);
            console.log(yaml.stringify(reactions));
          },
        )
        .command(
          "search",
          "Search messages or files across workspace",
          (y) =>
            y
              .option("query", {
                alias: "q",
                type: "string",
                demandOption: true,
                describe: "Search query",
              })
              .option("channel", {
                alias: "c",
                type: "string",
                describe: "Filter by channel ID",
              })
              .option("limit", {
                alias: "l",
                type: "number",
                default: 20,
                describe: "Max results",
              })
              .option("type", {
                type: "string",
                default: "messages",
                describe: "Search type: messages|files",
              })
              .option("sort", {
                type: "string",
                default: "timestamp",
                describe: "Sort by: score|timestamp",
              }),
          async (args) => {
            await loadEnvLocal();
            const searchType = args.type === "files" ? "files" : "messages";
            let results;
            if (searchType === "files") {
              results = await searchFiles(args.query as string, {
                limit: args.limit as number,
                sort: args.sort as "score" | "timestamp",
              });
            } else {
              results = await searchMessages(args.query as string, {
                channel: args.channel as string | undefined,
                limit: args.limit as number,
                sort: args.sort as "score" | "timestamp",
              });
            }
            console.log(yaml.stringify(results));
          },
        )
        .command(
          "pins <url>",
          "List pinned messages in a channel",
          (y) =>
            y.positional("url", {
              type: "string",
              describe: "Slack channel URL or message URL",
              demandOption: true,
            }),
          async (args) => {
            await loadEnvLocal();
            const parsed = parseSlackUrlSmart(args.url as string);
            if (!parsed.channel) {
              console.error("Invalid Slack URL - must be a channel or message URL");
              process.exit(1);
            }
            const pins = await listPinnedMessages(parsed.channel);
            console.log(yaml.stringify(pins));
          },
        )
        .command(
          "bookmarks <url>",
          "List bookmarks in a channel",
          (y) =>
            y.positional("url", {
              type: "string",
              describe: "Slack channel URL or message URL",
              demandOption: true,
            }),
          async (args) => {
            await loadEnvLocal();
            const parsed = parseSlackUrlSmart(args.url as string);
            if (!parsed.channel) {
              console.error("Invalid Slack URL - must be a channel or message URL");
              process.exit(1);
            }
            const bookmarks = await listChannelBookmarks(parsed.channel);
            console.log(yaml.stringify(bookmarks));
          },
        )
        .command(
          "permalink <url>",
          "Get permalink for a message",
          (y) =>
            y.positional("url", {
              type: "string",
              describe: "Slack message URL",
              demandOption: true,
            }),
          async (args) => {
            await loadEnvLocal();
            const parsed = parseSlackUrl(args.url as string);
            if (!parsed) {
              console.error("Invalid Slack message URL");
              process.exit(1);
            }
            const permalink = await getMessagePermalink(parsed.channel, parsed.ts);
            console.log(yaml.stringify(permalink));
          },
        )
        .command(
          "channel-info <url>",
          "Get detailed channel information",
          (y) =>
            y.positional("url", {
              type: "string",
              describe: "Slack channel URL or message URL",
              demandOption: true,
            }),
          async (args) => {
            await loadEnvLocal();
            const parsed = parseSlackUrlSmart(args.url as string);
            if (!parsed.channel) {
              console.error("Invalid Slack URL - must be a channel or message URL");
              process.exit(1);
            }
            const info = await getChannelInfo(parsed.channel);
            console.log(yaml.stringify(info));
          },
        )
        .command(
          "members <url>",
          "List channel members",
          (y) =>
            y
              .positional("url", {
                type: "string",
                describe: "Slack channel URL or message URL",
                demandOption: true,
              })
              .option("limit", {
                alias: "l",
                type: "number",
                default: 100,
                describe: "Max members",
              }),
          async (args) => {
            await loadEnvLocal();
            const parsed = parseSlackUrlSmart(args.url as string);
            if (!parsed.channel) {
              console.error("Invalid Slack URL - must be a channel or message URL");
              process.exit(1);
            }
            const members = await listChannelMembers(parsed.channel, args.limit as number);
            console.log(yaml.stringify(members));
          },
        )
        .command(
          "presence <user_id...>",
          "Get user presence status",
          (y) =>
            y.positional("user_id", {
              type: "string",
              describe: "User ID(s)",
              demandOption: true,
            }),
          async (args) => {
            await loadEnvLocal();
            const userIds = [args.user_id].flat() as string[];
            let result;
            if (userIds.length === 1) {
              result = await getUserPresence(userIds[0]);
            } else {
              result = await getBulkUserPresence(userIds);
            }
            console.log(yaml.stringify(result));
          },
        )
        .command(
          "context <url>",
          "Get complete message context (composite: message + reactions + thread + channel + user + permalink + pins)",
          (y) =>
            y.positional("url", {
              type: "string",
              describe: "Slack message URL",
              demandOption: true,
            }),
          async (args) => {
            await loadEnvLocal();
            const parsed = parseSlackUrl(args.url as string);
            if (!parsed) {
              console.error("Invalid Slack message URL");
              process.exit(1);
            }
            const context = await getCompleteMessageContext(parsed.channel, parsed.ts);
            console.log(yaml.stringify(context));
          },
        )
        .demandCommand(1, "Please specify a slack subcommand")
        .help();
    })
    .command(
      "notion search",
      "Search Notion workspace pages",
      (y) =>
        y
          .option("query", { alias: "q", type: "string", demandOption: true })
          .option("limit", { alias: "l", type: "number", default: 10 }),
      async (args) => {
        await loadEnvLocal();
        const { results, total, hasMore } = await searchNotion(
          args.query as string,
          (args.limit as number) ?? 10,
        );
        console.log(
          `Found ${results.length} of ${total}${hasMore ? "+" : ""} results for: "${args.query}"\n`,
        );
        for (const r of results) {
          console.log(`Title: ${r.title}`);
          console.log(`URL: ${r.url}`);
          console.log(`Last edited: ${r.last_edited_time}`);
          console.log("---");
        }
      },
    )
    .command(
      "notion people",
      "List GitHub→Slack mappings from Notion People database",
      (y) =>
        y
          .option("github", {
            alias: "g",
            type: "string",
            description: "Look up a specific GitHub username",
          })
          .option("missing", {
            alias: "m",
            type: "boolean",
            description: "Show active members missing a GitHub username",
            default: false,
          }),
      async (args) => {
        await loadEnvLocal();
        const mappings = await fetchPeopleMappings();

        if (args.github) {
          const slackId = await findSlackIdByGithubUsername(args.github);
          if (slackId) {
            const entry = mappings.find(
              (m) => m.githubUsername.toLowerCase() === args.github!.toLowerCase(),
            );
            console.log(yaml.stringify({ github: args.github, slackId, person: entry?.person }));
          } else {
            console.log(`No mapping found for GitHub username: ${args.github}`);
            process.exit(1);
          }
        } else if (args.missing) {
          const missing = mappings.filter((m) => !m.inactive && !m.githubUsername && m.slackId);
          console.log(`Active members without GitHub username: ${missing.length}\n`);
          console.log(yaml.stringify(missing));
        } else {
          const active = mappings.filter((m) => !m.inactive && m.slackId);
          console.log(`Active people mappings: ${active.length}\n`);
          console.log(
            yaml.stringify(
              active.map((m) => ({
                person: m.person || "(unnamed)",
                github: m.githubUsername || "(not set)",
                slackId: m.slackId,
              })),
            ),
          );
        }
      },
    )
    .command(
      "registry search",
      "Search ComfyUI custom nodes registry",
      (y) =>
        y
          .option("query", { alias: "q", type: "string", demandOption: true })
          .option("limit", { alias: "l", type: "number", default: 10 })
          .option("include-deprecated", { type: "boolean", default: false }),
      async (args) => {
        const results = await searchRegistryNodes({
          query: args.query as string,
          limit: (args.limit as number) ?? 10,
          includeDeprecated: args["include-deprecated"] as boolean,
        });

        console.log(`Found ${results.length} results for: "${args.query}"\n`);

        for (const node of results) {
          console.log(`📦 ${node.name} (${node.id})`);
          console.log(
            `   ${node.description.substring(0, 100)}${node.description.length > 100 ? "..." : ""}`,
          );
          console.log(`   Publisher: ${node.publisher.name}`);
          console.log(`   Version: ${node.latest_version.version}`);
          console.log(`   Repository: ${node.repository}`);
          console.log(`   Downloads: ${node.downloads} | Stars: ${node.github_stars}`);
          if (node.tags.length > 0) {
            console.log(`   Tags: ${node.tags.join(", ")}`);
          }
          console.log("---");
        }
      },
    )
    .command("video", "Video analysis commands", (yargs) => {
      return yargs
        .command(
          "read",
          "Analyze a video file using AI vision (Gemini or GPT-4o)",
          (y) =>
            y
              .option("file", {
                alias: "f",
                type: "string",
                describe: "Local video file path",
              })
              .option("slack-file", {
                type: "string",
                describe: "Slack file ID to download and analyze",
              })
              .option("slack-url", {
                type: "string",
                describe: "Slack file URL to download and analyze",
              })
              .option("model", {
                alias: "m",
                type: "string",
                default: "gemini",
                describe: "Model to use: gemini or gpt4o",
              })
              .option("prompt", {
                alias: "p",
                type: "string",
                describe: "Custom analysis prompt",
              })
              .check((argv) => {
                const sources = [argv.file, argv["slack-file"], argv["slack-url"]].filter(Boolean);
                if (sources.length === 0) {
                  throw new Error("One of --file, --slack-file, or --slack-url is required");
                }
                if (sources.length > 1) {
                  throw new Error(
                    "Only one of --file, --slack-file, or --slack-url can be specified",
                  );
                }
                if (!["gemini", "gpt4o"].includes(argv.model as string)) {
                  throw new Error("Model must be 'gemini' or 'gpt4o'");
                }
                return true;
              }),
          async (args) => {
            await loadEnvLocal();

            let videoPath = args.file as string | undefined;

            // Download from Slack if needed
            if (args["slack-file"] || args["slack-url"]) {
              let fileId = args["slack-file"] as string | undefined;

              if (args["slack-url"]) {
                const parsed = parseSlackUrlSmart(args["slack-url"] as string);
                if (!parsed.fileId) {
                  console.error("Could not extract file ID from Slack URL");
                  process.exit(1);
                }
                fileId = parsed.fileId;
              }

              // Download to temp path
              const fileInfo = await getSlackFileInfo(fileId!);
              const fileName = fileInfo.name || `video-${fileId}`;
              const tmpPath = `/tmp/${fileName}`;
              console.log(`Downloading Slack file ${fileId} → ${tmpPath}`);
              await downloadSlackFile(fileId!, tmpPath);
              videoPath = tmpPath;
            }

            console.log(`Analyzing video: ${videoPath}`);
            console.log(`Model: ${args.model}`);
            if (args.prompt)
              console.log(`Custom prompt: ${(args.prompt as string).substring(0, 80)}...`);
            console.log("---");

            const result = await readVideo(videoPath!, {
              model: args.model as "gemini" | "gpt4o",
              prompt: args.prompt as string | undefined,
            });

            console.log(result.description);
            console.log("\n---");
            console.log(`Model: ${result.model}`);
            console.log(`Usage: ${JSON.stringify(result.usage)}`);
            if (result.mdPath) console.log(`Report saved: ${result.mdPath}`);
          },
        )
        .demandCommand(1, "Please specify a video subcommand")
        .help();
    })
    .command("agent", "Agent control commands", (yargs) => {
      return yargs.command(
        "respond-slack-msg <url>",
        "Process a Slack message URL as if it was an app_mention event",
        (y) =>
          y.positional("url", {
            type: "string",
            describe: "Slack message URL to process",
            demandOption: true,
          }),
        async (args) => {
          await loadEnvLocal();
          const { spawnBotOnSlackMessageUrl } = await import("./slack-bot");
          const url = args.url as string;
          console.log(`Processing Slack message: ${url}`);
          await spawnBotOnSlackMessageUrl(url);
          console.log("✓ Message processing initiated");
        },
      );
    })
    .command("debug", "Debug and monitoring commands for bot tasks", (yargs) => {
      return yargs
        .command(
          "list",
          "List all active and recent claude-yes tasks",
          (y) => y,
          async () => {
            const { $ } = await import("bun");
            const scriptPath = path.join(import.meta.dir, "./list-tasks.sh");
            await $`bash ${scriptPath}`;
          },
        )
        .command(
          "watch <task_dir>",
          "Monitor a specific task with status, output, and errors",
          (y) =>
            y.positional("task_dir", {
              type: "string",
              describe: "Task directory path (e.g., /bot/slack/snomiao/1771137874-418759)",
              demandOption: true,
            }),
          async (args) => {
            const { $ } = await import("bun");
            const scriptPath = path.join(import.meta.dir, "./watch-task.sh");
            await $`bash ${scriptPath} ${args.task_dir}`;
          },
        )
        .command(
          "logs <task_dir>",
          "Show full stdout logs for a task",
          (y) =>
            y.positional("task_dir", {
              type: "string",
              describe: "Task directory path",
              demandOption: true,
            }),
          async (args) => {
            const logPath = `${args.task_dir}/.logs/claude-yes-stdout.log`;
            const { $ } = await import("bun");
            await $`tail -500 ${logPath}`;
          },
        )
        .command(
          "errors <task_dir>",
          "Show collected errors for a task",
          (y) =>
            y.positional("task_dir", {
              type: "string",
              describe: "Task directory path",
              demandOption: true,
            }),
          async (args) => {
            const errorsPath = `${args.task_dir}/.logs/COLLECTED_ERRORS.md`;
            const { $ } = await import("bun");
            try {
              await $`cat ${errorsPath}`;
            } catch {
              console.log("No errors collected for this task.");
            }
          },
        )
        .command(
          "status <task_dir>",
          "Show status file for a task",
          (y) =>
            y.positional("task_dir", {
              type: "string",
              describe: "Task directory path",
              demandOption: true,
            }),
          async (args) => {
            const statusPath = `${args.task_dir}/.logs/STATUS.txt`;
            const { $ } = await import("bun");
            await $`cat ${statusPath}`;
          },
        )
        .command(
          "tail <task_dir>",
          "Tail live stdout logs for a task",
          (y) =>
            y.positional("task_dir", {
              type: "string",
              describe: "Task directory path",
              demandOption: true,
            }),
          async (args) => {
            const logPath = `${args.task_dir}/.logs/claude-yes-stdout.log`;
            const { $ } = await import("bun");
            await $`tail -f ${logPath}`;
          },
        )
        .demandCommand(1, "Please specify a debug subcommand")
        .help();
    })
    .command(
      "feedback",
      "Submit feedback (bugs, feature requests, errors) to the private #prbot-feedback Slack channel",
      (y) =>
        y
          .option("message", {
            alias: "m",
            type: "string",
            describe: "Feedback message describing the issue or request",
            demandOption: true,
          })
          .option("type", {
            alias: "t",
            type: "string",
            choices: ["bug", "feature", "error", "other"] as const,
            describe: "Type of feedback",
            default: "other",
          })
          .option("context", {
            type: "string",
            describe: "Additional context (error output, command that failed, etc.)",
          })
          .option("source", {
            type: "string",
            describe: "Who or what is submitting this (e.g. amp-agent, user name)",
          }),
      async (args) => {
        await loadEnvLocal();
        const ts = await postFeedback({
          message: args.message as string,
          type: args.type as FeedbackType,
          context: args.context as string | undefined,
          source: args.source as string | undefined,
        });
        console.log(`✓ Feedback posted to #prbot-feedback (ts: ${ts})`);
      },
    )
    .demandCommand(1, "Please specify a command")
    .strict()
    .help()
    .wrap(Math.min(100, yargs().terminalWidth()))
    .epilog(
      [
        "Examples:",
        "  prbot code pr -r Comfy-Org/ComfyUI -b main -p 'Fix auth bug'",
        "  prbot code search -q 'binarization' --repo Comfy-Org/ComfyUI",
        "  prbot github-issue search -q 'authentication bug' -l 5",
        "  prbot registry search -q 'video' -l 5",
        "  prbot pr -r Comfy-Org/desktop -p 'Add spellcheck to editor'",
        "  prbot agent respond-slack-msg 'https://workspace.slack.com/archives/C123/p1234567890'",
        "  prbot debug list",
        "  prbot debug watch /bot/slack/snomiao/1771137874-418759",
        "  prbot debug tail /bot/slack/snomiao/1771137874-418759",
        "  prbot slack update -c C123 -t 1234567890.123456 -m 'Working on it'",
        "  prbot slack read-thread -c C123 -t 1234567890.123456",
        "  prbot slack read-thread -u 'https://workspace.slack.com/archives/C123/p1234567890'",
        "  prbot slack read-nearby -u 'https://workspace.slack.com/archives/C123/p1234567890' -b 20 -a 20",
        "  prbot slack upload -c C123 -f ./report.pdf -m 'Here is the report'",
        "  prbot slack post-with-files -c C123 -m 'Check these files' -f file1.pdf -f file2.png",
        "  prbot slack download-file -f F123ABC -o ./downloaded.pdf",
        "  prbot slack file-info -f F123ABC",
        "  prbot notion search -q 'ComfyUI setup' -l 5",
        "",
        "Feedback — report bugs, missing features, or errors (posts to private Slack):",
        "  prbot feedback -m 'Missing pr read command' -t feature",
        "  prbot feedback -m 'search returned 0 for known PRs' -t bug --context '...'",
        "  prbot feedback -m 'ReferenceError: X is not defined' -t error --source agent",
        "",
        "AI agents: if a command fails, is missing, or behaves unexpectedly,",
        "please run `prbot feedback` to report it so we can fix it.",
      ].join("\n"),
    ).argv;

  return argv;
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("CLI error:", err?.stack || err?.message || err);
    process.exit(1);
  });
}
