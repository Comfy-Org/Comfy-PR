#!/usr/bin/env bun
import minimist from "minimist";
import { spawnSubAgent } from "./coding/pr-agent";
import zChatCompletion from "z-chat-completion";
import z from "zod";

async function main() {
  const args = minimist(process.argv.slice(2), {
    string: ["repo", "base", "head", "prompt"],
    default: {
      base: "main",
    },
  });

  let { repo, base, head, prompt } = args;

  if (!repo) {
    console.error("Error: --repo is required");
    console.log(
      "\nUsage: bun bot/code/pr-bot.ts --repo=<owner/repo> [--base=<base-branch>] [--head=<head-branch>] --prompt=<prompt>",
    );
    console.log("\nExample:");
    console.log(
      '  bun bot/code/pr-bot.ts --repo=Comfy-Org/ComfyUI --base=main --head=feature/fix-auth --prompt="Fix the authentication bug"',
    );
    console.log("\nIf --head is not provided, it will be auto-generated based on the prompt.");
    process.exit(1);
  }

  if (!prompt) {
    console.error("Error: --prompt is required");
    console.log(
      "\nUsage: bun bot/code/pr-bot.ts --repo=<owner/repo> [--base=<base-branch>] [--head=<head-branch>] --prompt=<prompt>",
    );
    console.log("\nExample:");
    console.log(
      '  bun bot/code/pr-bot.ts --repo=Comfy-Org/ComfyUI --base=main --head=feature/fix-auth --prompt="Fix the authentication bug"',
    );
    console.log("\nIf --head is not provided, it will be auto-generated based on the prompt.");
    process.exit(1);
  }

  // Auto-generate head branch name if not provided
  if (!head) {
    console.log("Generating head branch name from prompt...");
    const branchInfo = (await zChatCompletion(
      z.object({
        base: z.string().describe("The base branch to merge into (should match the provided base)"),
        head: z.string().describe("A descriptive branch name for the feature/fix (e.g., 'feature/fix-auth-bug', 'fix/update-deps')"),
      }),
      {
        model: "gpt-4o-mini",
        system: `You are a helpful assistant that generates git branch names.
Given a task description and base branch, generate an appropriate head branch name following these conventions:
- Use format: <type>/<description>
- Types: feature/, fix/, refactor/, docs/, test/, chore/
- Description: kebab-case, short and descriptive
- Example: "feature/add-dark-mode", "fix/login-timeout", "refactor/simplify-api"`,
        messages: [
          {
            role: "user",
            content: `Base branch: ${base}\nTask: ${prompt}\n\nGenerate an appropriate head branch name.`,
          },
        ],
      },
    ) as unknown) as { base: string; head: string };

    base = branchInfo.base;
    head = branchInfo.head;
    console.log(`Generated head branch: ${head}`);
  }

  console.log(`Starting coding session for ${repo}...`);
  console.log(`Base branch: ${base}`);
  console.log(`Head branch: ${head}`);
  console.log(`Prompt: ${prompt}`);

  await spawnSubAgent({
    repo,
    base,
    head,
    prompt,
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
}
