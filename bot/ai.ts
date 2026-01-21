#!/usr/bin/env bun --watch
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, tool } from 'ai';
import { sleep } from 'bun';
import { fromWritable } from 'from-node-stream';
import sflow from 'sflow';
import { z } from 'zod';

const result = await streamText({
  model: anthropic('claude-sonnet-4-5'),
  messages,
  tools: {
    toolSearch: anthropic.tools.toolSearchBm25_20251119(),
    get_weather: tool({
      description: 'Get the current weather at a specific location',
      inputSchema: z.object({ location: z.string().describe('The city and state'), }),
      execute: async ({ location }) => { return ({ location, temperature: 72, condition: 'Sunny', }) },
    }),
  },
});

await (sflow(result.fullStream)
  .map(e => JSON.stringify(e) + '\n')
  .to(fromWritable(process.stdout)))
console.log('\ndone')
