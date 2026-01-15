#!/usr/bin/env bun
import minimist from "minimist";
import { spawnSubAgent } from "./coding/pr-agent";

async function main() {
  const args = minimist(process.argv.slice(2), {
    string: ["repo", "branch", "prompt"],
    default: {
      branch: "main",
    },
  });

  const { repo, branch, prompt } = args;

  if (!repo) {
    console.error("Error: --repo is required");
    console.log(
      "\nUsage: bun bot/github/pr-bot.ts --repo=<owner/repo> [--branch=<branch>] --prompt=<prompt>",
    );
    console.log("\nExample:");
    console.log(
      '  bun bot/github/pr-bot.ts --repo=Comfy-Org/ComfyUI --branch=main --prompt="Fix the authentication bug"',
    );
    process.exit(1);
  }

  if (!prompt) {
    console.error("Error: --prompt is required");
    console.log(
      "\nUsage: bun bot/github/pr-bot.ts --repo=<owner/repo> [--branch=<branch>] --prompt=<prompt>",
    );
    console.log("\nExample:");
    console.log(
      '  bun bot/github/pr-bot.ts --repo=Comfy-Org/ComfyUI --branch=main --prompt="Fix the authentication bug"',
    );
    process.exit(1);
  }

  console.log(`Starting coding session for ${repo}@${branch}...`);
  console.log(`Prompt: ${prompt}`);

  await spawnSubAgent({
    repo,
    branch,
    prompt,
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
}
