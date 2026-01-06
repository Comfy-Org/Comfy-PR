---
name: github-issue-search
description: Search for issues and pull requests across Comfy-Org GitHub repositories. Use when the user wants to find specific issues, bugs, features, or pull requests in ComfyUI-related repositories.
allowed-tools: Bash
model: haiku
---

# GitHub Issue Search

This skill searches for issues and pull requests across all Comfy-Org repositories using the GitHub API.

## Usage

```bash
pr-bot github-issue search -q "<SEARCH_QUERY>" [-l <LIMIT>]
```

## Parameters

- `-q, --query` (required): Search query text
- `-l, --limit` (optional): Maximum number of results to return (default: 10)

## Search Query Syntax

The search supports GitHub's issue search syntax:
- Simple keywords: `authentication bug`
- State filters: `is:open`, `is:closed`
- Type filters: `is:issue`, `is:pr`
- Label filters: `label:bug`, `label:enhancement`
- Author filters: `author:username`
- Date filters: `created:>2024-01-01`

## Examples

```bash
# Search for open bugs
pr-bot github-issue search -q "is:open label:bug" -l 10

# Find authentication-related issues
pr-bot github-issue search -q "authentication bug"

# Search for closed pull requests
pr-bot github-issue search -q "is:pr is:closed" -l 5

# Find issues by author
pr-bot github-issue search -q "author:snomiao is:open"

# Search with date filter
pr-bot github-issue search -q "created:>2024-12-01 is:open"
```

## Output Format

Returns results with:
- Issue/PR number
- Title
- Repository name
- State (open/closed)
- Type (Issue or Pull Request)
- Author username
- Labels
- GitHub URL
- Last updated timestamp

## Repositories Searched

Searches across all Comfy-Org repositories including:
- Comfy-Org/ComfyUI
- Comfy-Org/ComfyUI_frontend
- Comfy-Org/desktop
- Comfy-Org/docs
- Comfy-Org/registry
- And all other Comfy-Org repositories

## Notes

- Requires GitHub authentication token (GH_TOKEN or GH_TOKEN_COMFY_PR)
- Results are sorted by most recently updated
- Automatically loads environment variables from project .env.local
- Search is scoped to org:Comfy-Org automatically
