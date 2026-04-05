#!/usr/bin/env bash
set -euo pipefail

# Subtree mappings: prefix=remote@branch
SUBTREES=(
  "lib/slack-cli=https://github.com/snomiao/slack-cli.git@main"
)

ACTION="${1:-pull}"

for entry in "${SUBTREES[@]}"; do
  prefix="${entry%%=*}"
  remote_branch="${entry#*=}"
  remote="${remote_branch%%@*}"
  branch="${remote_branch#*@}"

  echo "[$ACTION] $prefix ← $remote ($branch)"

  case "$ACTION" in
    pull)
      git subtree pull --prefix="$prefix" "$remote" "$branch" --squash
      ;;
    push)
      git subtree push --prefix="$prefix" "$remote" "$branch"
      ;;
    *)
      echo "Usage: $0 [pull|push]"
      exit 1
      ;;
  esac
done

echo "Done."
