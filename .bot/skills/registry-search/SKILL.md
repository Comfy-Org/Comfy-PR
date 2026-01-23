---
name: ComfyUI Registry Search
description: Search for custom nodes and extensions in the ComfyUI registry.
---

# ComfyUI Registry Search

Search for custom nodes and plugins:
  prbot registry search --query "<search terms>" [--limit=5]

Examples:
  prbot registry search --query "video" --limit 5
  prbot registry search --query "upscaling models"

Best practices:
- Search for existing custom nodes before recommending new implementations.
- Provide registry URLs for discovered nodes.
- Check compatibility and maintenance status.
