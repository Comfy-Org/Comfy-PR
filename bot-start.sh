#!/bin/bash
# NOTE: This file has been moved to bot/up.sh for better organization
# This file is kept for backward compatibility
# Please use: ./bot/up.sh or bun bot/up.sh instead

cd "$(dirname "$0")"

echo "⚠️  Note: bot-start.sh has been moved to bot/up.sh"
echo "   Please use './bot/up.sh' for future runs"
echo ""

# Auto-restart loop for the bot
# The bot will exit with code 0 when it detects file changes and is idle
# This script will automatically restart it
while true; do
  # PRBOT_PORT=3475
  # bunx kill-port 3475
  echo "[$(date)] Starting ComfyPR Bot..."
  /root/.bun/bin/bun bot/index.ts --continue
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date)] Bot exited cleanly (code 0) - restarting in 2 seconds..."
    sleep 2
  else
    echo "[$(date)] Bot crashed with exit code $EXIT_CODE - restarting in 5 seconds..."
    sleep 5
  fi
done
