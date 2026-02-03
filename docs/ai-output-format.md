# AI Output Formatting and Model Comparison

## Goal

Return GitHub URLs from code search in markdown and compare model performance side-by-side in `bot/ai.ts`.

## Options Considered

### Option A: Prompt-only formatting

- **Approach**: Update the system prompt to force the model to include GitHub links and a model comparison.
- **Pros**: Minimal code change, quick to try.
- **Cons**: Unreliable; tool-only stops can still yield empty text, links depend on model behavior, hard to guarantee consistent link formatting.
- **Best when**: Quick experiments where strict output isn't required.

### Option B: Post-process tool results (chosen)

- **Approach**: Extract GitHub URLs from tool results and print a markdown list directly in CLI output; run multiple models and compute simple metrics (links, text length, runtime).
- **Pros**: Deterministic URLs, survives empty text responses, consistent formatting, clear comparison.
- **Cons**: Slightly more code; output logic becomes richer than a single model response.
- **Best when**: You need reliable links and reproducible comparisons.

### Option C: Structured JSON output + renderer

- **Approach**: Force JSON output from the model, then build a renderer that formats markdown + comparison.
- **Pros**: Strongly structured, future-proof for richer reports.
- **Cons**: Higher complexity; JSON schema/versioning work; more surface area for parse errors.
- **Best when**: You want machine-readable outputs or integrations beyond CLI display.

## Decision

Use **Option B**. It guarantees GitHub links appear even when the model stops after a tool call, and it allows direct, consistent model comparison without relying on model-provided structure.

## Implementation Notes

- Extract `match.url` values from code search tool results and print a compact single-line markdown list.
- Return up to 50 results per search to maximize link coverage.
- Prefer `comfy-codesearch --format json` and fall back to YAML output if needed; surface stderr when output is empty.
- Run multiple models sequentially and log per-model metrics: link count, response length, tool results count, duration.
- Print a compact tool call summary per model with tool name and truncated args.
- Rank best model by link count → response length → runtime.

## CLI Options (yargs)

- `query` (positional): Prompt string (default: `binarization for videos in ComfyUI?`)
- `--models`: Comma-separated model list (default: `gpt-4o,claude-sonnet-4-5`)
- `--maxSteps`: Max tool/response steps per model (default: `3`)
- `--limit`: Max results per code search (default: `50`)
