# Bot Skills

This directory contains the skills/utilities used by the ComfyPR Bot to interact with Slack, Notion, and other services.

## Unified CLI

A consolidated CLI is available at `bot/cli.ts` using yargs. It exposes GitHub PR-bot actions and Slack/Notion utilities via a single entry point.

Run with Bun:

```bash
bun bot/cli.ts --help
```

Common commands:

```bash
# Create a coding sub-agent and open a PR
bun bot/cli.ts github pr -r Comfy-Org/ComfyUI -b main -p "Fix auth bug"

# Alias for the above
bun bot/cli.ts pr -r Comfy-Org/desktop -p "Add spellcheck to editor"

# Slack utilities
bun bot/cli.ts slack update -c C123 -t 1234567890.123456 -m "Working on it"
bun bot/cli.ts slack read-thread -c C123 -t 1234567890.123456 -l 50

# Notion search
bun bot/cli.ts notion search -q "ComfyUI setup" -l 5
```

Environment requirements:

- GitHub PR agent: token/config as required by existing `bot/github` tools
- Slack: `SLACK_BOT_TOKEN`, `SLACK_SOCKET_TOKEN` (for socket mode)
- Notion: `NOTION_TOKEN`

## Slack Skills

### msg-update.ts

Update an existing Slack message.

**Usage:**

```bash
bun bot/slack/msg-update.ts --channel <channel_id> --ts <message_ts> --text "<new_text>"
```

**Example:**

```bash
bun bot/slack/msg-update.ts --channel C123ABC --ts 1234567890.123456 --text "Updated message content"
```

**Environment Variables:**

- `SLACK_BOT_TOKEN`: Your Slack bot token

### msg-read-thread.ts

Read all messages from a Slack thread.

**Usage:**

```bash
bun bot/slack/msg-read-thread.ts --channel <channel_id> --ts <thread_ts> [--limit <number>]
```

**Example:**

```bash
bun bot/slack/msg-read-thread.ts --channel C123ABC --ts 1234567890.123456 --limit 50
```

**Environment Variables:**

- `SLACK_BOT_TOKEN`: Your Slack bot token

### parseSlackMessageToMarkdown.ts

Utility function to convert Slack message formatting to Markdown.

**Features:**

- User mentions: `<@U123>` → `@U123`
- Channel mentions: `<#C456|general>` → `#general`
- Links: `<https://example.com|text>` → `[text](https://example.com)`
- Bold: `*text*` → `**text**`
- Italic: `_text_` → `*text*`
- Preserves code blocks and inline code

**Usage:**

```typescript
import { parseSlackMessageToMarkdown } from "./bot/slack/parseSlackMessageToMarkdown";

const markdown = await parseSlackMessageToMarkdown("Hello <@U123> with *bold* text");
```

### slackTsToISO.ts

Convert Slack timestamp to ISO 8601 format.

**Usage:**

```typescript
import { slackTsToISO } from "./bot/slack/slackTsToISO";

const iso = slackTsToISO("1703347200.123456");
// Returns: "2023-12-23T16:00:00.123Z"
```

## Notion Skills

### notion/search.ts

Search Notion pages in the Comfy-Org workspace.

**Usage:**

```bash
bun bot/notion/search.ts --query "<search_term>" [--limit <number>]
```

**Example:**

```bash
bun bot/notion/search.ts --query "ComfyUI setup" --limit 5
```

**Environment Variables:**

- `NOTION_TOKEN`: Your Notion integration token

**Output:**
Returns a JSON array of matching pages with title, URL, and timestamps.

## Testing

Test individual utilities:

```bash
# Test Slack timestamp conversion
bun bot/slack/slackTsToISO.ts

# Test Slack to Markdown parsing
bun bot/slack/parseSlackMessageToMarkdown.ts
```

## Development

All scripts follow the standard development pattern outlined in CLAUDE.md:

1. TypeScript with full type safety
2. Executable with `bun <file.ts>` when `import.meta.main` is true
3. Exportable functions for use as libraries
4. Command-line argument parsing with `yargs` in `bot/cli.ts` and `parseArgs` in leaf tools
5. Proper error handling and validation
6. Cached API clients from `@/lib`

## Notes

- All Slack and Notion API calls are automatically cached using the cached clients from `@/lib`
- Cache is stored in `node_modules/.cache/` directory
- Scripts can be used both as standalone CLI tools and as importable modules
