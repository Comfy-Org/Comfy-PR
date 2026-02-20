#!/usr/bin/env bun
import minimist from "minimist";
import { spawnSubAgent } from "./pr-agent";
// @ts-ignore
import zChatCompletion from "z-chat-completion";
import z from "zod";

const CC_TYPES = "feat|fix|build|chore|ci|docs|style|refactor|perf|test|revert";
const PRBOT_PREFIX_RE = new RegExp(`^prbot-(${CC_TYPES})-(.+)$`);
const TYPE_PREFIX_RE = new RegExp(`^(${CC_TYPES})[/\\-](.+)$`);

/** Normalize any branch name to prbot-[type]-[name] convention. */
function normalizeProbotBranch(name: string): string {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-/]/g, "-");

  // Already correct: prbot-feat-xxx
  if (PRBOT_PREFIX_RE.test(clean)) return clean;

  // Has type prefix: feat/xxx or fix-xxx → prbot-feat-xxx
  const typeMatch = clean.match(TYPE_PREFIX_RE);
  if (typeMatch) {
    const [, type, rest] = typeMatch;
    return `prbot-${type}-${rest.replace(/\//g, "-")}`;
  }

  // No type prefix — default to feat
  return `prbot-feat-${clean.replace(/\//g, "-")}`;
}

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
      "\nUsage: bun bot/code/prbot.ts --repo=<owner/repo> [--base=<base-branch>] [--head=<head-branch>] --prompt=<prompt>",
    );
    console.log("\nExample:");
    console.log(
      '  bun bot/code/prbot.ts --repo=Comfy-Org/ComfyUI --base=main --head=prbot-fix-auth --prompt="Fix the authentication bug"',
    );
    console.log("\nIf --head is not provided, it will be auto-generated based on the prompt.");
    process.exit(1);
  }

  if (!prompt) {
    console.error("Error: --prompt is required");
    console.log(
      "\nUsage: bun bot/code/prbot.ts --repo=<owner/repo> [--base=<base-branch>] [--head=<head-branch>] --prompt=<prompt>",
    );
    console.log("\nExample:");
    console.log(
      '  bun bot/code/prbot.ts --repo=Comfy-Org/ComfyUI --base=main --head=prbot-fix-auth --prompt="Fix the authentication bug"',
    );
    console.log("\nIf --head is not provided, it will be auto-generated based on the prompt.");
    process.exit(1);
  }

  // Auto-generate head branch name if not provided
  if (!head) {
    console.log("Generating head branch name from prompt...");
    const branchInfo = (await zChatCompletion(
      z.object({
        base: z
          .string()
          .describe("The base branch to make draft PR into (should match the specified base)"),
        head: z
          .string()
          .regex(
            /^prbot-(feat|fix|build|chore|ci|docs|style|refactor|perf|test|revert)-[a-z0-9][a-z0-9-]*$/,
            "Must follow format: prbot-<type>-<description> (e.g. prbot-feat-add-dark-mode)",
          )
          .describe(
            "Branch name strictly following format: prbot-<type>-<description> where type is any conventional commit type: feat, fix, build, chore, ci, docs, style, refactor, perf, test, revert",
          ),
      }),
      {
        model: "gpt-4o-mini",
      },
    )`You are a helpful assistant that generates git branch names.
Given a task description and base branch, generate an appropriate head branch name.

REQUIRED FORMAT: prbot-<type>-<description>
- Prefix: always "prbot-"
- Types (pick one): feat, fix, build, chore, ci, docs, style, refactor, perf, test, revert
- Description: kebab-case, short and descriptive, lowercase, no slashes
- Examples: "prbot-feat-add-dark-mode", "prbot-fix-login-timeout", "prbot-refactor-simplify-api", "prbot-docs-update-readme"

Base branch: ${base}
Task: ${prompt}`) as { base: string; head: string };

    base = branchInfo.base;
    head = branchInfo.head;
    console.log(`Generated head branch: ${head}`);
  }

  // Enforce prbot-[type]-[name] convention regardless of how head was provided
  const normalizedHead = normalizeProbotBranch(head);
  if (normalizedHead !== head) {
    console.log(`Normalized head branch: ${head} → ${normalizedHead}`);
  }
  head = normalizedHead;

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
