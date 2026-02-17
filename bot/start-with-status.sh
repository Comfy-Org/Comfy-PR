#!/usr/bin/env bash
# Start ComfyPR Bot with status display in tmux or separate terminals

set -e

# Check if tmux is available
if command -v tmux &> /dev/null; then
  echo "Starting bot with status display in tmux..."

  # Create a new tmux session
  SESSION="comfypr-bot"

  # Kill existing session if it exists
  tmux kill-session -t $SESSION 2>/dev/null || true

  # Create new session with bot
  tmux new-session -d -s $SESSION -n "bot" "bun bot/index.ts --continue"

  # Split window and run status display
  tmux split-window -h -t $SESSION:0 "bun bot/status.tsx"

  # Attach to session
  echo "Attaching to tmux session '$SESSION'..."
  echo "Use Ctrl+B then D to detach, or Ctrl+C to exit"
  tmux attach-session -t $SESSION
else
  echo "tmux not found. Install tmux for side-by-side display:"
  echo "  sudo apt install tmux    # Debian/Ubuntu"
  echo "  brew install tmux        # macOS"
  echo ""
  echo "Alternatively, run these in separate terminals:"
  echo "  Terminal 1: bun bot/index.ts --continue"
  echo "  Terminal 2: bun bot/status.tsx"
  exit 1
fi
