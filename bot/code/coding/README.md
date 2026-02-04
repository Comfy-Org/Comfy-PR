# Coding Sub-Agent

This directory contains tools for spawning AI coding agents to work on specific repositories.

## Usage

Run the following command to spawn a coding agent for a specific repository:

```bash
bun bot/github/pr-bot.ts --repo=<owner/repo> [--branch=<branch>] --prompt="<your prompt>"
```

### Arguments

- `--repo` (required): GitHub repository in the format `owner/repo`
- `--branch` (optional): Branch to work on (defaults to `main`)
- `--prompt` (required): The coding task or prompt for the agent

### Examples

```bash
# Work on the main branch of ComfyUI
bun bot/github/pr-bot.ts --repo=Comfy-Org/ComfyUI --prompt="Fix the authentication bug in the login module"

# Work on a specific branch
bun bot/github/pr-bot.ts --repo=Comfy-Org/ComfyUI_frontend --branch=develop --prompt="Add dark mode support to the settings page"

# Work on a documentation repo
bun bot/github/pr-bot.ts --repo=Comfy-Org/docs --prompt="Update the installation guide with Docker instructions"
```

## How It Works

1. **Auto-Clone**: The script automatically clones the specified repository to `/repos/[owner]/[repo]/tree/[branch]/` if it doesn't already exist
2. **Pull Updates**: If the repository already exists, it pulls the latest changes from the specified branch
3. **Spawn Agent**: Launches a `claude-yes` agent in the repository directory with your prompt
4. **Interactive Session**: The agent has full access to the repository and can read, edit, and create files

## Repository Storage

Cloned repositories are stored in the absolute system path:
```
/repos/[owner]/[repo]/tree/[branch]/
```

For example:
```
/repos/Comfy-Org/ComfyUI/tree/main/
/repos/Comfy-Org/ComfyUI_frontend/tree/develop/
```

This ensures consistent paths across different working directories.

## Requirements

- `bun` runtime
- `claude-yes` CLI tool installed and configured
- Git installed
- GitHub access to the repositories you want to work on

## Implementation Files

- **../pr-bot.ts**: Main CLI entry point with argument parsing
- **pr-agent.ts**: Core logic for cloning repos and spawning the agent
- **pr-agent.spec.ts**: Unit tests for pr-agent
