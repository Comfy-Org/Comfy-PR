#!/bin/bash
cd "$(dirname "$0")/.."

# PM2-based launch for the bot
# PM2 will handle auto-restart and process management

SERVICE_NAME="comfy-pr-bot"

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
  echo "pm2 is not installed. Installing pm2@5.3.0 globally..."
  npm install -g pm2@5.3.0
fi

# Stop existing instance if running
echo "[$(date)] Stopping existing $SERVICE_NAME instance if any..."
pm2 stop $SERVICE_NAME 2>/dev/null || true
pm2 delete $SERVICE_NAME 2>/dev/null || true

# Start the bot with pm2
echo "[$(date)] Starting ComfyPR Bot with pm2..."
pm2 start /root/.bun/bin/bun \
  --name $SERVICE_NAME \
  --interpreter none \
  -- bot/index.ts --continue

# Save pm2 process list
pm2 save

# Show status
echo "[$(date)] Bot started successfully"
pm2 status $SERVICE_NAME

# Follow logs
echo "[$(date)] Following logs (Ctrl+C to exit)..."
pm2 logs $SERVICE_NAME --lines 50
