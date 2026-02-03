#!/usr/bin/env bun --watch
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, streamText, tool } from "ai";
import { sleep } from "bun";
import { fromWritable } from "from-node-stream";
import sflow from "sflow";
import { z } from "zod";
const messages = [{ role: "user" as const, content: "What is the weather like in Seattle, WA?" }];

const result = await streamText({
  model: anthropic("claude-sonnet-4-5"),
  messages,
  tools: {
    toolSearch: anthropic.tools.toolSearchBm25_20251119(),
    get_weather: tool({
      description: "Get the current weather at a specific location",
      inputSchema: z.object({ location: z.string().describe("The city and state") }),
      execute: async ({ location }) => {
        return { location, temperature: 72, conditioin: "Sunny" };
      },
    }),
  },
});

await sflow(result.fullStream)
  .map((e) => JSON.stringify(e.type) + "\n")
  .to(fromWritable(process.stdout));

console.log("\ndone");
