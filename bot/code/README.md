# Coding Sub-Agent

This directory contains tools for spawning AI coding agents to work on specific repositories.

## Usage

Run the following command to spawn a coding agent for a specific repository:

```bash
bun bot/code/prbot.ts --repo=<owner/repo> [--base=<base-branch>] [--head=<head-branch>] --prompt="<your prompt>"
```

### Arguments

- `--repo` (required): GitHub repository in the format `owner/repo`
- `--base` (optional): Base branch to merge into (defaults to `main`)
- `--head` (optional): Head branch to develop on (auto-generated if not provided)
- `--prompt` (required): The coding task or prompt for the agent

### Examples

```bash
# Auto-generate head branch name
bun bot/code/prbot.ts --repo=Comfy-Org/ComfyUI --prompt="Fix the authentication bug in the login module"

# Specify both base and head branches
bun bot/code/prbot.ts --repo=Comfy-Org/ComfyUI --base=main --head=feature/fix-auth --prompt="Fix the authentication bug"

# Work on a feature branch to be merged into develop
bun bot/code/prbot.ts --repo=Comfy-Org/ComfyUI_frontend --base=develop --head=feature/dark-mode --prompt="Add dark mode support to the settings page"

# Let AI generate an appropriate branch name
bun bot/code/prbot.ts --repo=Comfy-Org/docs --base=main --prompt="Update the installation guide with Docker instructions"
```

## How It Works

1. **Branch Name Generation**: If `--head` is not provided, the script uses AI (GPT-4o-mini) to generate an appropriate branch name based on your prompt
2. **Auto-Clone**: The script clones the specified repository to `/repos/[owner]/[repo]/tree/[head]/` if it doesn't already exist
3. **Branch Setup**:
   - Checks if the base branch exists remotely
   - Clones with the base branch
   - Checks if the head branch exists; if not, creates it from base
4. **Pull Updates**: If the repository already exists, it pulls the latest changes
5. **Spawn Agent**: Launches a `claude-yes` agent in the repository directory with your prompt
6. **Enhanced Prompt**: The agent receives additional context about the base and head branches for creating pull requests
7. **Interactive Session**: The agent has full access to the repository and can read, edit, and create files

## Branch Naming Convention

When auto-generating branch names, the AI follows these conventions:

- **Format**: `<type>/<description>`
- **Types**:
  - `feature/` - New features
  - `fix/` - Bug fixes
  - `refactor/` - Code refactoring
  - `docs/` - Documentation changes
  - `test/` - Test additions/changes
  - `chore/` - Maintenance tasks
- **Description**: kebab-case, short and descriptive
- **Examples**:
  - `feature/add-dark-mode`
  - `fix/login-timeout`
  - `refactor/simplify-api`
  - `docs/update-readme`

## Repository Storage

Cloned repositories are stored in the absolute system path using the **head branch**:

```
/repos/[owner]/[repo]/tree/[head]/
```

For example:

```
/repos/Comfy-Org/ComfyUI/tree/feature/fix-auth/
/repos/Comfy-Org/ComfyUI_frontend/tree/feature/dark-mode/
/repos/Comfy-Org/docs/tree/docs/update-docker/
```

This ensures:

- Consistent paths across different working directories
- Isolated development environments per feature branch
- Easy identification of what branch you're working on

## Pull Request Workflow

The agent is instructed to:

1. Make changes on the `head` branch
2. Commit changes with clear commit messages
3. Push the `head` branch to remote
4. Create a pull request to merge `head` → `base`

## Requirements

- `bun` runtime
- `claude-yes` CLI tool installed and configured
- `gh` CLI (GitHub CLI) for API operations
- Git installed
- GitHub token set as `GH_TOKEN_COMFY_PR_BOT` or `GH_TOKEN` environment variable
- OpenAI API key for branch name generation (if using auto-generation)

## Implementation Files

- **../prbot.ts**: Main CLI entry point with argument parsing and branch name generation
- **pr-agent.ts**: Core logic for cloning repos, branch management, and spawning the agent
- **pr-agent.spec.ts**: Unit tests for pr-agent

## Environment Variables

- `GH_TOKEN_COMFY_PR_BOT` or `GH_TOKEN`: GitHub personal access token with repo access
- `OPENAI_API_KEY`: OpenAI API key for AI-powered branch name generation
