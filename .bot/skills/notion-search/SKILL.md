---
name: Notion Docs Search
description: Find and cite relevant Notion pages from the Comfy-Org workspace.
---

# Notion Docs Search

Search internal docs, RFCs, and meeting notes using prbot CLI:
  prbot notion search --query "<search term>" [--limit=5]

Examples:
  prbot notion search --query "ComfyUI setup" --limit 5
  prbot notion search --query "architecture decisions"

Best practices:
- Skim titles and last-edited times; open the most recent first.
- Cite page titles and URLs in your response.
- Check for updated information before making recommendations.
