# Smart Restart Quick Reference

## TL;DR

The bot now **waits for idle state** before restarting when files change. No more interrupted tasks! 🎉

## Quick Commands

```bash
# Start bot with smart restart (default)
bun bot/index.ts --continue

# Start without smart restart
bun bot/index.ts --continue --no-watch

# Production (auto-restart loop)
./bot-start.sh

# Run example
bun bot/restart-example.ts

# Run tests
bun test bot/RestartManager.spec.ts
```

## How to Know It's Working

Look for these log messages:

```
✅ Starting:
[RestartManager] Starting file watcher for 3 paths
[RestartManager] Watching: /path/to/bot

✅ File changed:
[RestartManager] File changed: bot/index.ts
[RestartManager] ⏳ Restart queued - waiting for bot to become idle...

✅ Waiting for idle:
[RestartManager] Bot is busy, waiting for idle state...

✅ Restarting:
[RestartManager] 🔄 Bot is idle - restarting now!
```

## Configuration Cheat Sheet

| Setting             | Default                     | What it does            |
| ------------------- | --------------------------- | ----------------------- |
| `watchPaths`        | `['bot', 'src', 'lib']`     | Directories to watch    |
| `isIdle`            | `TaskInputFlows.size === 0` | When bot is idle        |
| `idleCheckInterval` | `5000` (5s)                 | How often to check idle |
| `debounceDelay`     | `1000` (1s)                 | Wait after file change  |

## Ignored Files

Won't trigger restart:

- `*.md` (documentation)
- `*.log` (logs)
- `.cache/`, `.logs/`, `.git/`
- `node_modules/`
- `*.nedb`, `*.sqlite`

## Troubleshooting

### Bot not restarting after file change

1. Check if `--no-watch` flag is set
2. Verify file is in watched directory (`bot/`, `src/`, `lib/`)
3. Check if file matches ignore pattern (e.g., `.md` files)

### Bot restarting too often

1. Increase `debounceDelay` in `bot/index.ts`
2. Add more patterns to ignore list

### Bot never restarts (stuck waiting)

1. Check if tasks are completing properly
2. Verify `TaskInputFlows` is being cleaned up
3. Check logs for "Bot is busy" messages

### Want to force restart now

```bash
# Kill the process, bot-start.sh will restart it
pkill -f "bun bot/index.ts"
```

## Developer Tips

### Adding new watched directories

Edit `bot/index.ts`:

```typescript
const restartManager = new RestartManager({
  watchPaths: ["bot", "src", "lib", "my-new-dir"], // Add here
  // ...
});
```

### Changing idle detection logic

Edit `bot/index.ts`:

```typescript
const restartManager = new RestartManager({
  isIdle: () => {
    // Custom logic here
    return TaskInputFlows.size === 0 && myOtherCondition;
  },
  // ...
});
```

### Adding custom ignore patterns

Edit `bot/RestartManager.ts`:

```typescript
private shouldIgnoreFile(filename: string): boolean {
  const ignorePatterns = [
    /node_modules/,
    // Add your patterns here
    /\.test\.ts$/,  // Ignore test files
    /\.backup$/,    // Ignore backups
  ];
  return ignorePatterns.some(pattern => pattern.test(filename));
}
```

## Files Reference

| File                         | Purpose                   |
| ---------------------------- | ------------------------- |
| `bot/RestartManager.ts`      | Core implementation       |
| `bot/RestartManager.spec.ts` | Tests                     |
| `bot/restart-example.ts`     | Interactive demo          |
| `docs/RESTART.md`            | Full documentation        |
| `docs/RESTART-SUMMARY.md`    | Implementation summary    |
| `docs/RESTART-FLOW.md`       | Flow diagrams             |
| `docs/RESTART-QUICKREF.md`   | This file                 |
| `bot/up.sh`                  | Production startup script |

## Common Scenarios

### Scenario 1: Quick fix during active task

```
1. Bot is processing a task
2. You fix a typo in bot/index.ts
3. Restart is queued
4. Task completes
5. Bot restarts automatically with your fix
```

### Scenario 2: Multiple file edits

```
1. Edit bot/index.ts
2. Edit src/utils.ts
3. Edit lib/slack.ts
4. Debounce waits 1s after last edit
5. Single restart queued
6. Bot restarts once when idle
```

### Scenario 3: Emergency disable

```bash
# Disable smart restart
bun bot/index.ts --continue --no-watch

# Or set environment variable
NO_WATCH=1 bun bot/index.ts --continue
```

## Metrics to Monitor

Watch these in production:

- **Restart frequency**: How often is the bot restarting?
- **Wait time**: How long does restart wait for idle?
- **Task interruptions**: Should be zero with smart restart
- **File change events**: Are we watching the right files?

## Best Practices

✅ **DO:**

- Let the bot restart automatically
- Edit files freely during development
- Trust the idle detection

❌ **DON'T:**

- Use `--watch` flag anymore
- Manually restart unless necessary
- Edit files in `node_modules/`

## Emergency Procedures

### Bot stuck in restart loop

```bash
# Stop the bot
pkill -f "bun bot/index.ts"

# Start without watch
bun bot/index.ts --continue --no-watch

# Debug the issue
# Fix the problem
# Restart with watch enabled
```

### Need immediate restart

```bash
# Option 1: Kill process (bot-start.sh will restart)
pkill -f "bun bot/index.ts"

# Option 2: Stop and start manually
pkill -f "bun bot/index.ts"
bun bot/index.ts --continue
```

## Support

- Full docs: `docs/RESTART.md`
- Flow diagrams: `docs/RESTART-FLOW.md`
- Implementation: `docs/RESTART-SUMMARY.md`
- Code: `bot/RestartManager.ts`
