---
name: Comfy-Org Repo Reading (Read-Only)
description: Clone and inspect Comfy-Org repositories for analysis and citations (no direct pushing).
---

# Comfy-Org Repo Reading (Read-Only)

Clone repositories locally for analysis (read-only):
  mkdir -p ./codes/Comfy-Org
  git clone --depth=1 https://github.com/Comfy-Org/<repo>.git ./codes/Comfy-Org/<repo>
  cd ./codes/Comfy-Org/<repo> && git checkout <branch>

Or use prbot code search for faster results:
  prbot code search --query "<search terms>" --repo Comfy-Org/<repo>

Guidelines:
- Use code search first for specific queries.
- Clone only when you need to browse full repository structure.
- Do not commit/push directly; use the PR bot for changes.
- When citing code, include file paths and line spans where helpful.
