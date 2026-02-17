#!/usr/bin/env bash
# List all active and recent claude-yes tasks

echo "🔍 Active and Recent Tasks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Find all task directories
for TASK_DIR in /bot/slack/*/*; do
  if [ ! -d "$TASK_DIR" ]; then
    continue
  fi

  STATUS_FILE="$TASK_DIR/.logs/STATUS.txt"

  if [ ! -f "$STATUS_FILE" ]; then
    continue
  fi

  # Extract info
  PID=$(grep "^PID:" "$STATUS_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ')
  STATUS=$(grep "^Status:" "$STATUS_FILE" 2>/dev/null | cut -d: -f2- | tr -d ' ')
  STARTED=$(grep "^Started:" "$STATUS_FILE" 2>/dev/null | cut -d: -f2-)

  # Check if running
  RUNNING="❌"
  RUNTIME=""
  if [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1; then
    RUNNING="✅"
    RUNTIME=$(ps -p "$PID" -o etime= | tr -d ' ')
  fi

  echo "📂 $(basename $(dirname $TASK_DIR))/$(basename $TASK_DIR)"
  echo "   Status: $STATUS"
  echo "   Running: $RUNNING PID: ${PID:-N/A}"
  if [ -n "$RUNTIME" ]; then
    echo "   Runtime: $RUNTIME"
  fi
  echo "   Started: $STARTED"
  echo "   Watch: ./bot/watch-task.sh $TASK_DIR"
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 To monitor a specific task:"
echo "   ./bot/watch-task.sh <task-directory>"
echo ""
echo "💡 To see all running claude-yes processes:"
echo "   ps aux | grep claude-yes | grep -v grep"
