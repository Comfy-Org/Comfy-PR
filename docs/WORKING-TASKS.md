# Working Tasks State Management

## Overview

The bot now uses a simplified state management system to track currently active tasks. Instead of querying the entire database for incomplete tasks, it maintains a lightweight list of working message events in the `current-working-tasks` state key.

## How It Works

### State Structure

```typescript
{
  "current-working-tasks": {
    workingMessageEvents: [
      {
        type: "app_mention",
        user: "U123",
        ts: "1234567890.123456",
        text: "user message",
        team: "T123",
        channel: "C123",
        // ... other event fields
      },
      // ... more events
    ]
  }
}
```

### Task Lifecycle

1. **Task Start**: When `processSlackAppMentionEvent()` begins processing a task (after quick response), the event is added to `current-working-tasks`
2. **Task Running**: The event remains in the list while the agent is working
3. **Task Complete**: When the task finishes (successfully or stopped by user), the event is removed from the list

### Resume on Restart

When the bot starts with `--continue` flag:

1. Reads the `current-working-tasks` state
2. Iterates through all `workingMessageEvents`
3. Calls `processSlackAppMentionEvent(event)` for each event
4. The process function automatically continues from the previous state (using existing workspace and `.claude-yes` state)

## Implementation Details

### Helper Functions

```typescript
// Add event to working tasks list
async function addWorkingTask(event: z.infer<typeof zAppMentionEvent>);

// Remove event from working tasks list
async function removeWorkingTask(event: z.infer<typeof zAppMentionEvent>);
```

### Integration Points

**bot/index.ts:**

- **Line ~692**: `addWorkingTask(event)` - Called when task starts thinking
- **Line ~518**: `removeWorkingTask(event)` - Called when task is stopped by user
- **Line ~1200**: `removeWorkingTask(event)` - Called when task completes successfully
- **Line ~120-135**: Resume logic reads from `current-working-tasks` on `--continue`

## Benefits

### Before (Old Approach)

- ❌ Queried entire MongoDB collection for incomplete tasks
- ❌ Fallback to parsing NEDB YAML file
- ❌ Complex filtering logic for task statuses
- ❌ Slower startup on `--continue`

### After (New Approach)

- ✅ Single state key lookup (`current-working-tasks`)
- ✅ Only stores actively running tasks
- ✅ Automatic cleanup when tasks complete
- ✅ Fast resume on restart
- ✅ Simple, predictable state management

## Testing

Run the test suite:

```bash
bun test bot/WorkingTasksManager.spec.ts
```

Tests cover:

- Adding tasks to working list
- Preventing duplicate tasks
- Removing tasks from working list
- Handling multiple concurrent tasks
- Empty state initialization

## Migration Notes

The old approach using `db.collection("ComfyPRBotState").find()` has been replaced. The individual task states (`task-${workspaceId}`) are still maintained for backward compatibility and detailed status tracking, but are no longer used for resume logic.

## Example Usage

```typescript
// Start a task
await addWorkingTask(event);
// ... do work ...
await removeWorkingTask(event);

// Resume on restart
const workingTasks = (await State.get("current-working-tasks")) || { workingMessageEvents: [] };
for (const event of workingTasks.workingMessageEvents) {
  processSlackAppMentionEvent(event).catch((err) => {
    logger.error(`Error resuming task`, { err });
  });
}
```

## Troubleshooting

### Tasks not resuming on restart

Check the state:

```bash
# In bot working directory
cat ./.cache/ComfyPRBotState.nedb.yaml | grep current-working-tasks
```

### Tasks stuck in working list

Manually clear the state:

```typescript
await State.set("current-working-tasks", { workingMessageEvents: [] });
```

Or delete the state file:

```bash
rm ./.cache/ComfyPRBotState.nedb.yaml
```

## Future Improvements

- Add task timeout detection (remove tasks older than X hours)
- Add health check endpoint to view current working tasks
- Add admin command to manually clear stuck tasks
- Add metrics for task duration and success rate
