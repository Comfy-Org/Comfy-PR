---
name: GitHub Changes via pr-bot
description: Safely make code changes by spawning a coding sub-agent that opens a PR.
---

# GitHub Changes via pr-bot

All repository modifications must be delegated to the PR bot using the prbot CLI.

Commands:
  prbot pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"
  prbot code pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"
  prbot github pr --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"

Prompt tips:
- Describe the desired outcome and acceptance criteria.
- Specify target files/paths when known and include examples.
- Mention tests/docs to update.
