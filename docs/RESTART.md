# Smart Restart Manager

The bot now includes a smart restart mechanism that watches for file changes and automatically restarts the bot **only when it's idle** (no active tasks running).

## How It Works

1. **File Watching**: Monitors `bot/`, `src/`, and `lib/` directories for changes
2. **Change Detection**: Debounces file changes (1 second) to avoid multiple restarts
3. **Idle Detection**: Checks if `TaskInputFlows.size === 0` (no active tasks)
4. **Smart Restart**: Only restarts when the bot is idle, preventing interruption of ongoing work

## Usage

### Start with Auto-Restart (Default)

```bash
bun bot/index.ts serve --continue
```

The bot will automatically watch for file changes and restart when idle.

### Disable Auto-Restart

```bash
bun bot/index.ts serve --continue --no-watch
```

Use this flag if you want to disable the smart restart feature.

### Production Deployment

The `bot-start.sh` script includes an auto-restart loop:

```bash
./bot-start.sh
```

This ensures the bot automatically restarts:

- After clean exits (code 0) - waits 2 seconds
- After crashes (non-zero exit) - waits 5 seconds

## Configuration

The restart manager can be configured in `bot/index.ts`:

```typescript
const restartManager = new RestartManager({
  watchPaths: ["bot", "src", "lib"], // Directories to watch
  isIdle: () => TaskInputFlows.size === 0, // Idle detection function
  onRestart: () => process.exit(0), // Restart action
  idleCheckInterval: 5000, // Check idle every 5s
  debounceDelay: 1000, // Debounce changes by 1s
});
```

## Ignored Files

The following patterns are automatically ignored:

- `node_modules/`
- `.cache/`
- `.logs/`
- `.git/`
- `.nedb`, `.sqlite` files
- `.log` files
- `.md` files (documentation)
- Temporary files (`~`)

## Behavior

### When Files Change

1. File change detected → debounce timer starts (1s)
2. After debounce → restart queued
3. Bot checks if idle every 5 seconds
4. When idle → bot exits with code 0
5. `bot-start.sh` detects clean exit → restarts bot after 2s

### When Bot is Busy

```
[RestartManager] File changed: bot/index.ts
[RestartManager] ⏳ Restart queued - waiting for bot to become idle...
[RestartManager] Bot is busy, waiting for idle state...
[RestartManager] Bot is busy, waiting for idle state...
[RestartManager] 🔄 Bot is idle - restarting now!
```

### When Bot is Idle

```
[RestartManager] File changed: bot/index.ts
[RestartManager] ⏳ Restart queued - waiting for bot to become idle...
[RestartManager] 🔄 Bot is idle - restarting now!
```

## Benefits

✅ **No Interruptions**: Never restarts while processing tasks  
✅ **Fast Updates**: Automatically picks up code changes  
✅ **Safe**: Waits for tasks to complete before restarting  
✅ **Configurable**: Easy to customize or disable  
✅ **Production Ready**: Works with systemd, PM2, or simple bash loops

## Comparison with `--watch`

| Feature              | `--watch` | Smart Restart |
| -------------------- | --------- | ------------- |
| Detects changes      | ✅        | ✅            |
| Restarts immediately | ✅        | ❌            |
| Waits for idle       | ❌        | ✅            |
| Interrupts tasks     | ✅        | ❌            |
| Configurable         | ❌        | ✅            |

## Troubleshooting

### Bot not restarting after changes

1. Check if `--no-watch` flag is set
2. Verify files are in watched directories (`bot/`, `src/`, `lib/`)
3. Check logs for restart manager messages

### Bot restarting too frequently

1. Increase `debounceDelay` in configuration
2. Add more patterns to `shouldIgnoreFile()` method

### Bot not detecting idle state

1. Check `TaskInputFlows.size` is properly updated
2. Verify tasks are being removed from the map when complete
3. Adjust `idleCheckInterval` if needed

## Implementation Details

See `bot/RestartManager.ts` for the full implementation.
