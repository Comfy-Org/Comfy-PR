---
name: registry-search
description: Search the ComfyUI custom nodes registry for plugins and extensions. Use when the user wants to find specific custom nodes, ComfyUI extensions, or plugins by name, functionality, or description.
allowed-tools: Bash
model: haiku
---

# ComfyUI Registry Search

This skill searches the official ComfyUI custom nodes registry (api.comfy.org) for available plugins and extensions.

## Usage

```bash
pr-bot registry search -q "<SEARCH_QUERY>" [-l <LIMIT>] [--include-deprecated]
```

## Parameters

- `-q, --query` (required): Search query text
- `-l, --limit` (optional): Maximum number of results to return (default: 10)
- `--include-deprecated` (optional): Include deprecated nodes in results (default: false)

## Search Coverage

The search looks across multiple fields:

- Node name
- Description
- Author name
- Node ID
- Publisher name
- Repository URL
- Tags

## Examples

```bash
# Search for video-related nodes
pr-bot registry search -q "video" -l 5

# Find image processing nodes
pr-bot registry search -q "image enhance"

# Search for specific functionality
pr-bot registry search -q "background removal"

# Include deprecated nodes
pr-bot registry search -q "upscale" --include-deprecated -l 10
```

## Output Format

Returns results with:

- Node name and ID
- Description (truncated to 100 chars)
- Publisher information
- Latest version number
- Repository URL
- Download count
- GitHub stars
- Tags (if available)

## Example Output

```
📦 Remove Background (SET) (remove-background)
   Background remove and/or replacement.
   Can be applied to images and videos...
   Publisher: Salvador Eduardo Tropea
   Version: 1.0.0
   Repository: https://github.com/set-soft/ComfyUI-RemoveBackground_SET
   Downloads: 462 | Stars: 12
   Tags: image, video
---
```

## Notes

- Searches across **all** nodes in the ComfyUI registry (3000+ custom nodes)
- Results exclude deprecated nodes by default
- No authentication required
- Search is case-insensitive
- Results are client-side filtered (fetches all nodes then filters)
