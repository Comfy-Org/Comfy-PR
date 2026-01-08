# Smart Restart Flow Diagram

## Overview Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Bot Running                              │
│                                                                  │
│  ┌──────────────┐         ┌──────────────┐                     │
│  │   Task 1     │         │   Task 2     │                     │
│  │  (Active)    │         │  (Active)    │                     │
│  └──────────────┘         └──────────────┘                     │
│                                                                  │
│  TaskInputFlows.size = 2  ← Bot is BUSY                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    File Change Detected
                    (bot/index.ts edited)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    RestartManager                                │
│                                                                  │
│  1. Debounce Timer (1s)                                         │
│     Wait for more changes...                                    │
│                                                                  │
│  2. Queue Restart                                               │
│     ⏳ Restart queued - waiting for bot to become idle...       │
│                                                                  │
│  3. Idle Check Loop (every 5s)                                  │
│     ┌─────────────────────────────────────┐                    │
│     │ Is TaskInputFlows.size === 0?       │                    │
│     │                                      │                    │
│     │  NO → Wait 5s → Check again          │                    │
│     │  YES → Execute Restart               │                    │
│     └─────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Tasks Complete
                    TaskInputFlows.size = 0
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Execute Restart                               │
│                                                                  │
│  1. Clear idle check timer                                      │
│  2. Stop file watchers                                          │
│  3. Log: 🔄 Bot is idle - restarting now!                       │
│  4. process.exit(0)                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    bot-start.sh Loop                             │
│                                                                  │
│  Detects exit code 0 (clean exit)                              │
│  Waits 2 seconds                                                │
│  Restarts: bun bot/index.ts --continue                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Bot Restarted                                 │
│                                                                  │
│  - New code loaded                                              │
│  - RestartManager starts watching again                         │
│  - Ready to handle new tasks                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Detailed State Machine

```
                    ┌──────────────┐
                    │   WATCHING   │
                    │  (Initial)   │
                    └──────┬───────┘
                           │
                    File Change Event
                           │
                           ↓
                    ┌──────────────┐
                    │  DEBOUNCING  │
                    │   (1 sec)    │
                    └──────┬───────┘
                           │
                    Timer Expires
                           │
                           ↓
                    ┌──────────────┐
              ┌────→│   QUEUED     │
              │     │ (Waiting)    │
              │     └──────┬───────┘
              │            │
              │     Check Idle (every 5s)
              │            │
              │     ┌──────┴───────┐
              │     │              │
              │   BUSY           IDLE
              │     │              │
              └─────┘              ↓
                            ┌──────────────┐
                            │  RESTARTING  │
                            │ (Exiting)    │
                            └──────┬───────┘
                                   │
                            process.exit(0)
                                   │
                                   ↓
                            ┌──────────────┐
                            │   RESTARTED  │
                            │  (New Proc)  │
                            └──────────────┘
```

## Timeline Example

```
Time    Event                           State           TaskCount
────────────────────────────────────────────────────────────────────
00:00   Bot starts                      WATCHING        0
00:05   User mentions bot               WATCHING        1 (task-1)
00:10   Edit bot/index.ts               DEBOUNCING      1
00:11   Debounce complete               QUEUED          1
00:11   Check idle? NO (busy)           QUEUED          1
00:16   Check idle? NO (busy)           QUEUED          1
00:20   Task-1 completes                QUEUED          0
00:21   Check idle? YES (idle)          RESTARTING      0
00:21   Process exits                   -               -
00:23   Bot restarts (2s delay)         WATCHING        0
00:25   Ready for new tasks             WATCHING        0
```

## Comparison: Old vs New Behavior

### Old Behavior (--watch)

```
Edit File → Immediate Restart → Tasks Interrupted ❌
```

Timeline:
```
00:00   Task starts
00:05   Edit file
00:05   RESTART (task interrupted!)
00:05   Task lost/corrupted
```

### New Behavior (Smart Restart)

```
Edit File → Queue Restart → Wait for Idle → Safe Restart ✅
```

Timeline:
```
00:00   Task starts
00:05   Edit file
00:05   Restart queued (waiting...)
00:10   Task completes
00:10   RESTART (safe!)
00:10   No data loss
```

## Configuration Impact

### Debounce Delay

```
Short (100ms)  → More responsive, may restart too often
Medium (1000ms) → Balanced (default)
Long (5000ms)  → Less responsive, fewer restarts
```

### Idle Check Interval

```
Short (1000ms)  → Faster restart when idle, more CPU
Medium (5000ms) → Balanced (default)
Long (30000ms)  → Slower restart, less CPU
```

## Edge Cases Handled

1. **Multiple rapid file changes**
   - Debounce timer resets on each change
   - Only one restart queued

2. **File change while already queued**
   - Skips duplicate queue
   - Logs: "Restart already pending"

3. **Bot crashes during restart**
   - bot-start.sh detects non-zero exit
   - Waits 5 seconds before restart

4. **Ignored files changed**
   - No restart triggered
   - Examples: .md, .log, node_modules/

5. **Bot never becomes idle**
   - Restart stays queued indefinitely
   - Logs every 5 seconds: "Bot is busy, waiting..."

