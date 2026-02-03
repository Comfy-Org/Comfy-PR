---
name: github-pr-bot
description: Spawn an AI coding sub-agent to make code changes, fix bugs, or add features to GitHub repositories. Use when the user wants to modify code in Comfy-Org repositories, create pull requests, or implement new functionality.
allowed-tools: Bash
---

# GitHub PR Bot (Coding Sub-Agent)

This skill spawns an interactive AI coding agent that can modify code in GitHub repositories, create commits, and propose pull requests.

## Usage

```bash
prbot code pr -r <OWNER/REPO> [-b <BRANCH>] -p "<TASK_DESCRIPTION>"
# Or use aliases:
prbot github pr -r <OWNER/REPO> [-b <BRANCH>] -p "<TASK_DESCRIPTION>"
prbot pr -r <OWNER/REPO> [-b <BRANCH>] -p "<TASK_DESCRIPTION>"
```

## Parameters

- `-r, --repo` (required): GitHub repository in format `owner/repo` (e.g., `Comfy-Org/ComfyUI`)
- `-b, --branch` (optional): Target branch to work on (default: `main`)
- `-p, --prompt` (required): Detailed description of the coding task for the agent

## How It Works

1. **Auto-Clone**: Clones the repository to `/repos/[owner]/[repo]/tree/[branch]/` if not present
2. **Update**: Pulls latest changes if repository already exists
3. **Spawn Agent**: Launches an interactive `claude-yes` coding agent in the repo directory
4. **Full Access**: Agent can read, edit, create files, run tests, and create commits

## Examples

```bash
# Fix a bug in ComfyUI
prbot pr -r Comfy-Org/ComfyUI -p "Fix authentication bug in login module - users can't login with special characters in password"

# Add feature to frontend
prbot github pr -r Comfy-Org/ComfyUI_frontend -b develop -p "Add dark mode toggle to settings page with persistent user preference"

# Update documentation
prbot pr -r Comfy-Org/docs -p "Add troubleshooting section for common installation errors on Windows"
```

## Available Repositories

- `Comfy-Org/ComfyUI` - Main ComfyUI backend (Python)
- `Comfy-Org/ComfyUI_frontend` - Frontend codebase (Vue + TypeScript)
- `Comfy-Org/docs` - Documentation and guides
- `Comfy-Org/desktop` - Desktop application
- `Comfy-Org/registry` - Custom nodes registry
- `Comfy-Org/workflow_templates` - Workflow templates

## Notes

- Agent runs in isolated directory per branch
- Requires GitHub authentication via environment variables
- Agent has full write access to make commits
- Best for tasks that require code modification
