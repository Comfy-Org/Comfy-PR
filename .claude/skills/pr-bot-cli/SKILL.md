---
name: comfy-pr-bot-cli
description: Unified command-line interface for all ComfyPR bot capabilities including GitHub PR creation, Slack messaging, and Notion search. Use when the user wants to access any bot functionality through a single unified command.
allowed-tools: Bash
---

# PR-Bot Unified CLI

This skill provides a unified command-line interface for all ComfyPR bot capabilities.

## Available Commands

### Code PR Creation (Automatic)

```bash
pr-bot code pr -r <OWNER/REPO> [-b <BRANCH>] -p "<PROMPT>"
pr-bot github pr -r <OWNER/REPO> [-b <BRANCH>] -p "<PROMPT>"  # Alias
pr-bot pr -r <OWNER/REPO> [-b <BRANCH>] -p "<PROMPT>"  # Short alias
```

**Options:**

- `-r, --repo`: Repository in format `owner/repo` (required)
- `-b, --branch`: Target branch (default: `main`)
- `-p, --prompt`: Coding task description (required)

### Code Search

```bash
pr-bot code search -q "<QUERY>" [--repo <REPO>] [--path <PATH>]
```

**Options:**

- `-q, --query`: Search query (required)
- `--repo`: Filter by repository (optional)
- `--path`: Filter by file path pattern (optional)

### GitHub Issue Search

```bash
pr-bot github-issue search -q "<QUERY>" [-l <LIMIT>]
```

**Options:**

- `-q, --query`: Search query (required)
- `-l, --limit`: Maximum number of results (default: 10)

### Slack Message Update

```bash
pr-bot slack update -c <CHANNEL_ID> -t <TIMESTAMP> -m "<MESSAGE>"
```

**Options:**

- `-c, --channel`: Slack channel ID (required)
- `-t, --ts`: Message timestamp (required)
- `-m, --text`: New message text (required)

### Slack Thread Reader

```bash
pr-bot slack read-thread -c <CHANNEL_ID> -t <TIMESTAMP> [-l <LIMIT>]
```

**Options:**

- `-c, --channel`: Slack channel ID (required)
- `-t, --ts`: Thread timestamp (required)
- `-l, --limit`: Max messages to retrieve (default: 100)

### Notion Search

```bash
pr-bot notion search -q "<QUERY>" [-l <LIMIT>]
```

**Options:**

- `-q, --query`: Search terms (required)
- `-l, --limit`: Max results (default: 10)

### Registry Search

```bash
pr-bot registry search -q "<QUERY>" [-l <LIMIT>] [--include-deprecated]
```

**Options:**

- `-q, --query`: Search query for custom nodes (required)
- `-l, --limit`: Maximum number of results (default: 10)
- `--include-deprecated`: Include deprecated nodes (default: false)

## Examples

```bash
# Create automatic PR for bug fix
pr-bot code pr -r Comfy-Org/ComfyUI -b main -p "Fix auth bug in login"

# Search ComfyUI code
pr-bot code search -q "binarization" --repo Comfy-Org/ComfyUI

# Search GitHub issues
pr-bot github-issue search -q "is:open label:bug" -l 5

# Search ComfyUI custom nodes registry
pr-bot registry search -q "video" -l 5

# Update Slack message
pr-bot slack update -c C123 -t 1234567890.123456 -m "Working on it"

# Read Slack thread
pr-bot slack read-thread -c C123 -t 1234567890.123456

# Search Notion docs
pr-bot notion search -q "ComfyUI setup" -l 5
```

## Notes

- This is the recommended way to access all bot functionality
- Globally linked as `pr-bot` command
- Run `pr-bot --help` for full command documentation
- Each subcommand has its own `--help` option
