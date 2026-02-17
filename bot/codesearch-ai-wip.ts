#!/usr/bin/env bun --watch
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";

const systemPrompt = `You are a helpful ComfyUI expert assistant. You help users find code, understand implementations, and solve problems related to ComfyUI and its ecosystem.

## Your Capabilities
- Search code across Comfy-Org repositories and 2000+ community custom nodes
- Explain ComfyUI concepts, nodes, and workflows
- Help debug issues and find relevant implementations

## Code Search Guidelines
- When searching for code, use simple descriptive keywords (e.g., "binarization", "mask threshold", "video segmentation")
- Do NOT invent repository names - leave the repo filter empty to search all repositories
- Only use repo: filter if user specifically mentions a repository name
- After getting search results, summarize the most relevant findings with links

## Response Style
- Be concise and direct, reduce lines where possible
- Provide code snippets or links when relevant
- If search returns no results, suggest alternative search terms
- ALWAYS provide a text summary after using tools - never end with just tool calls
- Summarize the top 3-5 most relevant results with clickable GitHub links

## Available Repositories (for reference)
- Comfy-Org/ComfyUI: Main ComfyUI backend (Python)
- Comfy-Org/ComfyUI_frontend: Frontend (Vue + TypeScript)  
- Comfy-Org/desktop: Desktop application
- Plus 2000+ community custom node repositories
`;

type ModelRun = { name: string; model: ReturnType<typeof openai> | ReturnType<typeof anthropic> };

const availableModels = new Map<string, ModelRun>([
  ["gpt-4o", { name: "gpt-4o", model: openai("gpt-4o") }],
  ["claude-sonnet-4-5", { name: "claude-sonnet-4-5", model: anthropic("claude-sonnet-4-5") }],
]);

const resolveModels = (names: string[]): ModelRun[] => {
  const requested = names.length > 0 ? names : ["gpt-4o", "claude-sonnet-4-5"];
  const runs = requested.map((name) => {
    const entry = availableModels.get(name);
    if (!entry) {
      throw new Error(`Unknown model: ${name}`);
    }
    return entry;
  });
  return runs;
};

const createTools = (resultLimit: number) => ({
  code_search: tool({
    description:
      "Search for code in Comfy-Org and community custom nodes repositories. " +
      "Supports filters: repo:<owner/repo> and path:<pattern>. " +
      "Examples: 'binarization', 'repo:Comfy-Org/ComfyUI last_node_id', 'path:python auth'",
    inputSchema: z.object({
      query: z.string().describe("Search query with optional repo: and path: filters"),
      repo: z.string().optional().describe("Filter by repository (e.g. Comfy-Org/ComfyUI)"),
      path: z.string().optional().describe("Filter by file path pattern"),
    }),
    execute: async ({ query, repo, path }) => {
      let fullQuery = query;
      if (repo) fullQuery = `repo:${repo} ${fullQuery}`;
      if (path) fullQuery = `path:${path} ${fullQuery}`;
      if (!fullQuery.trim()) {
        return { query: fullQuery, error: "empty query" };
      }

      const { $ } = await import("bun");
      let result = await $`comfy-codesearch --format json ${{ raw: fullQuery }}`.nothrow();
      let output = result.stdout.toString();

      if (result.exitCode !== 0 || !output.trim()) {
        const fallback = await $`comfy-codesearch ${{ raw: fullQuery }}`.nothrow();
        if (fallback.stdout.toString().trim()) {
          result = fallback;
          output = fallback.stdout.toString();
        }
      }

      if (!output.trim()) {
        return {
          query: fullQuery,
          error: result.stderr.toString() || "empty output from comfy-codesearch",
        };
      }
      try {
        const parsed = JSON.parse(output);
        return {
          query: fullQuery,
          resultCount: parsed.results?.length ?? 0,
          results: parsed.results?.slice(0, resultLimit) ?? [],
        };
      } catch {
        // comfy-codesearch returns YAML by default
        const { parse: parseYaml } = await import("yaml");
        try {
          const parsed = parseYaml(output);
          return {
            query: fullQuery,
            resultCount: parsed.results?.length ?? 0,
            results: parsed.results?.slice(0, resultLimit) ?? [],
          };
        } catch {
          return { query: fullQuery, raw: output.slice(0, 2000) };
        }
      }
    },
  }),
  get_weather: tool({
    description: "Get the current weather at a specific location",
    inputSchema: z.object({ location: z.string().describe("The city and state") }),
    execute: async ({ location }) => {
      return { location, temperature: 72, condition: "Sunny" };
    },
  }),
});

type RunSummary = {
  name: string;
  durationMs: number;
  textLength: number;
  toolCallsCount: number;
  toolResultsCount: number;
  urlCount: number;
  error?: string;
};

type CodeMatch = {
  path: string;
  url: string;
  snippet: string;
};

const extractCodeMatches = (toolResults: unknown[]): CodeMatch[] => {
  const seen = new Set<string>();
  const matches: CodeMatch[] = [];
  for (const tr of toolResults) {
    const trObj = tr as Record<string, unknown>;
    const result = (trObj?.result ?? trObj?.output ?? tr ?? {}) as Record<string, unknown>;
    const items = (result?.results ?? []) as unknown[];
    for (const item of items) {
      const itemObj = item as Record<string, unknown>;
      for (const match of (itemObj?.matches ?? []) as unknown[]) {
        const matchObj = match as Record<string, unknown>;
        if (
          typeof matchObj?.url === "string" &&
          matchObj.url.includes("github.com") &&
          !seen.has(matchObj.url)
        ) {
          seen.add(matchObj.url);
          matches.push({
            path: (matchObj?.path as string) ?? "",
            url: matchObj.url,
            snippet: (matchObj?.snippet as string) ?? (matchObj?.content as string) ?? "",
          });
        }
      }
    }
  }
  return matches;
};

const summarizeCodeMatches = async (matches: CodeMatch[]): Promise<Map<string, string>> => {
  if (matches.length === 0) return new Map();

  const snippetsText = matches
    .map((m, i) => `[${i}] ${m.path}:\n${m.snippet.slice(0, 500)}`)
    .join("\n\n");

  const { generateText: gen } = await import("ai");
  const result = await gen({
    model: openai("gpt-4o-mini"),
    messages: [
      {
        role: "user",
        content: `Summarize what each code snippet does in 5-10 words. Return one line per snippet in format: [index] summary

${snippetsText}`,
      },
    ],
    maxOutputTokens: 500,
  });

  const summaryMap = new Map<string, string>();
  for (const line of result.text.split("\n")) {
    const match = line.match(/^\[(\d+)\]\s*(.+)/);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (matches[idx]) {
        summaryMap.set(matches[idx].url, match[2].trim());
      }
    }
  }
  return summaryMap;
};

const formatCodeMatch = (match: CodeMatch, summary: string): string => {
  return `[${match.path} - ${summary}](${match.url})`;
};

const runAi = async (options: {
  query: string;
  models: string[];
  maxSteps: number;
  limit: number;
}) => {
  const modelRuns = resolveModels(options.models);
  const tools = createTools(options.limit);
  const runSummaries: RunSummary[] = [];

  console.log(
    `🤖 Asking models (${modelRuns.map((run) => run.name).join(", ")}): ${options.query}`,
  );
  console.log("─".repeat(60));

  for (const run of modelRuns) {
    const startedAt = Date.now();
    try {
      const result = await generateText({
        model: run.model,
        system: systemPrompt,
        messages: [{ role: "user", content: options.query }],
        // temperature: 0,
        stopWhen: stepCountIs(options.maxSteps),
        tools,
      });
      const durationMs = Date.now() - startedAt;
      const toolResults =
        result.steps?.flatMap(
          (step: unknown) => ((step as Record<string, unknown>).toolResults as unknown[]) ?? [],
        ) ?? [];
      const toolCalls =
        result.steps?.flatMap(
          (step: unknown) => ((step as Record<string, unknown>).toolCalls as unknown[]) ?? [],
        ) ?? [];
      const codeMatches = extractCodeMatches(toolResults);

      console.log(`\n🤖 Model: ${run.name}`);
      console.log("─".repeat(60));
      if (codeMatches.length > 0) {
        const summaryMap = await summarizeCodeMatches(codeMatches);
        console.log(`\nResults (${codeMatches.length}):`);
        codeMatches.forEach((match) => {
          const summary = summaryMap.get(match.url) || "code snippet";
          console.log(`  • ${formatCodeMatch(match, summary)}`);
        });
      }
      if (toolCalls.length > 0) {
        const callList = toolCalls.map((call: unknown) => {
          const callObj = call as Record<string, unknown>;
          const args = callObj.args ? JSON.stringify(callObj.args) : "{}";
          return `${callObj.toolName ?? "tool"}(${args.slice(0, 120)}${args.length > 120 ? "..." : ""})`;
        });
        console.log(`\nTool calls (${toolCalls.length}): ${callList.join(" | ")}`);
      }

      runSummaries.push({
        name: run.name,
        durationMs,
        textLength: result.text?.length ?? 0,
        toolCallsCount: toolCalls.length,
        toolResultsCount: toolResults.length,
        urlCount: codeMatches.length,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`\n🤖 Model: ${run.name}`);
      console.log("─".repeat(60));
      console.log("\n⚠️  Error: " + message);
      runSummaries.push({
        name: run.name,
        durationMs,
        textLength: 0,
        toolCallsCount: 0,
        toolResultsCount: 0,
        urlCount: 0,
        error: message,
      });
    }
  }

  if (runSummaries.length > 0) {
    console.log("\n📊 Model comparison:");
    runSummaries.forEach((summary) => {
      console.log(
        `   • ${summary.name}: urls=${summary.urlCount}, textChars=${summary.textLength}, ` +
          `toolCalls=${summary.toolCallsCount}, toolResults=${summary.toolResultsCount}, ` +
          `timeMs=${summary.durationMs}${summary.error ? " (error)" : ""}`,
      );
    });

    const ranked = [...runSummaries].sort((a, b) => {
      if (b.urlCount !== a.urlCount) return b.urlCount - a.urlCount;
      if (b.textLength !== a.textLength) return b.textLength - a.textLength;
      return a.durationMs - b.durationMs;
    });
    if (ranked[0]) {
      console.log(`\n🏁 Best overall: ${ranked[0].name}`);
    }
  }

  console.log("\n" + "─".repeat(60));
  console.log("\n✅ Done!");
};

if (import.meta.main) {
  const argv = await yargs(hideBin(process.argv))
    .command("$0 [query]", "Run ComfyUI assistant", (builder) =>
      builder.positional("query", {
        type: "string",
        default: "binarization for videos in ComfyUI?",
        describe: "Search prompt for the assistant",
      }),
    )
    .option("models", {
      type: "string",
      default: "gpt-4o,claude-sonnet-4-5",
      describe: "Comma-separated model list",
    })
    .option("maxSteps", {
      type: "number",
      default: 20, //
      describe: "Max tool/response steps per model",
    })
    .option("limit", {
      type: "number",
      default: 50,
      describe: "Max results per code search",
    })
    .strict()
    .parse();

  const modelList = String(argv.models)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  await runAi({
    query: String(argv.query),
    models: modelList,
    maxSteps: Number(argv.maxSteps),
    limit: Number(argv.limit),
  });
}
