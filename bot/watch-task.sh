#!/usr/bin/env bash
# Helper script to watch a running claude-yes task

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <task-directory>"
  echo ""
  echo "Example: $0 /bot/slack/snomiao/1771137874-418759"
  echo ""
  echo "Or list all tasks:"
  echo "  ls -dt /bot/slack/*/* | head -10"
  exit 1
fi

TASK_DIR="$1"
LOG_DIR="$TASK_DIR/.logs"
STATUS_FILE="$LOG_DIR/STATUS.txt"
STDOUT_LOG="$LOG_DIR/claude-yes-stdout.log"
STDERR_LOG="$LOG_DIR/claude-yes-stderr.log"

echo "🔍 Monitoring task: $TASK_DIR"
echo ""

# Show status
if [ -f "$STATUS_FILE" ]; then
  echo "📊 Status:"
  cat "$STATUS_FILE"
  echo ""
else
  echo "⚠️  No status file found at $STATUS_FILE"
fi

# Check if process is running
if [ -f "$STATUS_FILE" ]; then
  PID=$(grep "^PID:" "$STATUS_FILE" | cut -d: -f2 | tr -d ' ')
  if [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1; then
    echo "✅ Process $PID is running"
    ps -p "$PID" -o pid,etime,cmd
  else
    echo "❌ Process $PID is not running"
  fi
  echo ""
fi

# Show recent output
echo "📝 Recent output (last 30 lines):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "$STDOUT_LOG" ]; then
  tail -30 "$STDOUT_LOG"
else
  echo "⚠️  No stdout log found"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show errors if any
if [ -f "$STDERR_LOG" ] && [ -s "$STDERR_LOG" ]; then
  echo "⚠️  Stderr output:"
  tail -20 "$STDERR_LOG"
  echo ""
fi

# Show collected errors from workspace
COLLECTED_ERRORS="$LOG_DIR/COLLECTED_ERRORS.md"
if [ -f "$COLLECTED_ERRORS" ] && [ -s "$COLLECTED_ERRORS" ]; then
  echo "🚨 Collected errors from workspace:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  tail -50 "$COLLECTED_ERRORS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "💡 Full error log: cat $COLLECTED_ERRORS"
  echo ""
fi

# Offer to tail live
echo "💡 To watch live output:"
echo "   tail -f $STDOUT_LOG"
echo ""
echo "💡 To see all files:"
echo "   ls -la $TASK_DIR"
