#!/usr/bin/env bun
import { readFile } from "fs/promises";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { checkComfyActivated } from "./checkComfyActivated";
import { createComfyRegistryPullRequests } from "./createComfyRegistryPullRequests";

async function resolveRepos(args: {
  repolist?: string;
  _: (string | number)[];
}): Promise<string[]> {
  const envRepos =
    process.env.REPO?.split("\n")
      .map((e) => e.trim())
      .filter(Boolean) || [];

  const argvRepos = args._.map(String).filter(Boolean);

  const listRepos =
    (args.repolist &&
      (await readFile(args.repolist, "utf8").catch(() => ""))
        .split("\n")
        .map((e) => e.trim())
        .filter(Boolean)) ||
    [];

  const repos =
    (listRepos.length && listRepos) ||
    (argvRepos.length && argvRepos) ||
    (envRepos.length && envRepos) ||
    [];

  if (repos.length === 0) {
    console.error("Error: No repos specified. Provide URLs as args, --repolist, or REPO env var.");
    process.exit(1);
  }
  return repos;
}

const cli = yargs(hideBin(process.argv))
  .scriptName("cpr")
  .usage("$0 <command> [options]")
  .command(
    "create [repos..]",
    "Create registry publish PRs for ComfyUI custom nodes",
    (yargs) =>
      yargs
        .positional("repos", {
          describe: "GitHub repository URLs",
          type: "string",
          array: true,
        })
        .option("repolist", {
          alias: "l",
          type: "string",
          describe: "File with one repo URL per line",
        }),
    async (args) => {
      await checkComfyActivated();
      const repos = await resolveRepos({ repolist: args.repolist, _: args.repos || [] });
      for (const url of repos) {
        await createComfyRegistryPullRequests(url);
      }
    },
  )
  .example("$0 create https://github.com/owner/repo", "Create PR for a single repo")
  .example("$0 create --repolist repos.txt", "Create PRs from a file (one URL per line)")
  .example("$0 create url1 url2 url3", "Create PRs for multiple repos")
  .example("REPO=https://github.com/owner/repo $0 create", "Create PR via env variable")
  .demandCommand(1, "Please specify a command. Run with --help to see available commands.")
  .strict()
  .help()
  .alias("h", "help")
  .version()
  .alias("v", "version");

await cli.parse();
