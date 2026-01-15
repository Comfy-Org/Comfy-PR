---
name: code-search
description: Search ComfyUI codebase and custom nodes using the comfy-codesearch service. Use when the user wants to find code examples, search for specific functions, or explore ComfyUI repositories.
allowed-tools: Bash
model: haiku
---

# ComfyUI Code Search

This skill searches through ComfyUI codebase and custom nodes using the comfy-codesearch service.

## Usage

```bash
pr-bot code search -q "<SEARCH_QUERY>" [--repo <REPO>] [--path <PATH>]
```

## Parameters

- `-q, --query` (required): Search query text
- `--repo` (optional): Filter by repository (e.g. `Comfy-Org/ComfyUI`)
- `--path` (optional): Filter by file path pattern (e.g. `python`)

## Search Syntax

The search query supports special filters:

- `repo:owner/name` - Search within a specific repository
- `path:pattern` - Search within specific file paths

## Examples

```bash
# Search for binarization features
pr-bot code search -q "binarization"

# Search in specific repository
pr-bot code search -q "last_node_id" --repo Comfy-Org/ComfyUI

# Search with path filter
pr-bot code search -q "last_node_id" --repo Comfy-Org/ComfyUI --path python

# Complex search with inline filters
pr-bot code search -q "repo:Comfy-Org/ComfyUI path:python last_node_id"
```

## Output Format

Returns JSON with search results containing:

- Repository name and URL
- File path and line number
- Code snippet with match context
- GitHub URL to the exact match

## Tips

1. Use quotes around multi-word queries
2. Combine `--repo` and `--path` filters for targeted searches
3. Pipe output to `jq` for JSON parsing: `pr-bot code search -q "test" | jq .results`
4. Check match URLs to jump directly to code on GitHub

## Notes

- Requires `comfy-codesearch` CLI to be installed
- Requires CS_ORIGIN and CS_TOKEN environment variables
- Searches across ComfyUI core and custom nodes registry
