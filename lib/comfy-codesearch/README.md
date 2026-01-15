# CLI Usage Examples

This document provides practical examples of using the ComfyUI CodeSearch CLI to search through ComfyUI custom nodes.

## Setup

Before using the CLI, ensure you have the required environment variables set:

```bash
export CS_ORIGIN="https://cs.comfy.org"
export CS_TOKEN="your-token-here"
```

Or copy `.env.local.example` to `.env.local` and fill in the values.

## Example 1: Finding Custom Nodes with Specific Features

### Searching for Video Binarization Features

To find which custom nodes have video binarization features:

```bash
comfy-codesearch search "binarization"
```

**Results:**

- **ComfyUI-Sa2VA-XJ** (by alexjx)
  - Repository: https://github.com/alexjx/ComfyUI-Sa2VA-XJ
  - Provides video segmentation with binarization capabilities
  - Outputs raw sigmoid probabilities (0.0-1.0) instead of binary masks
  - The `threshold` parameter controls binarization
  - Default binarization threshold is 0.5

Additional related searches:

```bash
# Search for binarize functions
comfy-codesearch search "binarize"

# Search for binary mask operations in video context
comfy-codesearch search "binary mask video"
```

## Example 2: Repository-Specific Searches

Search within a specific repository:

```bash
comfy-codesearch search "repo:Comfy-Org/ComfyUI last_node_id"
```

## Example 3: Path-Specific Searches

Search for code in specific file paths:

```bash
comfy-codesearch search "repo:Comfy-Org/ComfyUI path:python last_node_id"
```

## Example 4: Repository Discovery

Find repositories by name:

```bash
comfy-codesearch repo "comfy"
```

## Output Format

The CLI outputs JSON that can be piped to `jq` for further processing:

```bash
comfy-codesearch search "binarization" | jq '.results[].repository' -r
```

This will extract just the repository names from the results.

## Tips

1. **Use quotes** around multi-word search queries
2. **Combine filters** like `repo:` and `path:` to narrow down results
3. **Pipe to jq** for better JSON parsing and filtering
4. **Check match URLs** in the results to jump directly to the code on GitHub
