# Running ComfyPR Bot

## PM2 Setup (Recommended for production)

The bot has crash recovery with the `--continue` flag. PM2 configuration has been created but needs adjustment due to Bun/PM2 integration issues.

### Current Status

The bot runs successfully with Bun directly:

```bash
bun bot/index.ts --continue
```

### Features Implemented

1. **Crash Recovery**: The bot automatically resumes incomplete tasks on restart using the `--continue` flag
   - Tasks are stored in state (MongoDB or NeDB fallback)
   - Only tasks not in "done", "stopped_by_user", or "forward_to_pr_bot_channel" status are resumed

2. **Auto-restart Configuration**: PM2 config in `ecosystem.config.cjs`
   - Watches `bot/**/*.ts` files for changes
   - Memory limit: 500MB
   - Exponential backoff on crashes

### Running with PM2 (Work in Progress)

There's an integration issue between PM2 and Bun's path resolution. The workaround:

```bash
# Start bot directly with Bun (recommended for now)
bun bot/index.ts --continue

# Or use the wrapper script
./bot-start.sh
```

### Troubleshooting

If the bot crashes frequently:

1. Check logs in `.logs/bot-YYYY-MM-DD.log`
2. Verify Slack tokens in `.env.local`
3. Check MongoDB connection
4. Disable test code that may be calling Slack API on startup

### Future Improvements

- Fix PM2/Bun integration for proper process management
- Add health check endpoint monitoring
- Implement graceful shutdown handling
- Add metrics and monitoring
