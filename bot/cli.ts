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
  } catch (e) {
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
  const zChatCompletion = (await import("z-chat-completion")).default;
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
        const result = await $`comfy-codesearch ${{ raw: query }}`.quiet();
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
                sort: args.sort as Record<string, unknown>,
              });
            } else {
              results = await searchMessages(args.query as string, {
                channel: args.channel as string | undefined,
                limit: args.limit as number,
                sort: args.sort as Record<string, unknown>,
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
        "  prbot slack update -c C123 -t 1234567890.123456 -m 'Working on it'",
        "  prbot slack read-thread -c C123 -t 1234567890.123456",
        "  prbot slack read-thread -u 'https://workspace.slack.com/archives/C123/p1234567890'",
        "  prbot slack read-nearby -u 'https://workspace.slack.com/archives/C123/p1234567890' -b 20 -a 20",
        "  prbot slack upload -c C123 -f ./report.pdf -m 'Here is the report'",
        "  prbot slack post-with-files -c C123 -m 'Check these files' -f file1.pdf -f file2.png",
        "  prbot slack download-file -f F123ABC -o ./downloaded.pdf",
        "  prbot slack file-info -f F123ABC",
        "  prbot notion search -q 'ComfyUI setup' -l 5",
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
