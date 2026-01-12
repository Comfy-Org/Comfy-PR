# Bug Fixes: Slack WebSocket Message Handling

## Problem 1: App Mention Event Schema Mismatch

The bot was not processing some `app_mention` events from Slack, logging them as `MSG_NOT_MATCHED` in `bot/msg.log`.

## Problem 2: System Messages Not Handled

The bot was logging Slack WebSocket system messages (like "hello" and "disconnect") as `MSG_NOT_MATCHED`, even though they are normal protocol messages.

## Root Cause

The Zod schema for `app_mention` events in `bot/index.ts` had two issues:

1. **`client_msg_id` was required** - But Slack doesn't always include this field (especially for retry attempts or certain message types)
2. **`attachments` field was missing** - Events with attachments (like message unfurls) were being rejected

## Event Analysis

From `bot/msg.log`, the actual event structure was:

```typescript
{
  type: 'app_mention',
  user: 'U04F3GHTG2X',
  ts: '1766560478.446979',
  // ❌ client_msg_id: MISSING!
  text: '<@U078499LK5K> do some research...',
  team: 'T0462DJ9G3C',
  blocks: [...],
  channel: 'C0A51KF8SMU',
  assistant_thread: {...},
  attachments: [...],  // ❌ Not in schema!
  event_ts: '1766560478.446979'
}
```

## Solution

Updated the Zod schema and TypeScript interface in `bot/index.ts`:

### Before (lines 35-48)

```typescript
const zAppMentionEvent = z.object({
  type: z.literal("app_mention"),
  user: z.string(),
  ts: z.string(),
  client_msg_id: z.string(), // ❌ Required
  text: z.string(),
  team: z.string(),
  thread_ts: z.string().optional(),
  parent_user_id: z.string().optional(),
  blocks: z.array(z.any()),
  channel: z.string(),
  assistant_thread: z.any().optional(),
  // ❌ attachments missing
  event_ts: z.string(),
});
```

### After (lines 35-49)

```typescript
const zAppMentionEvent = z.object({
  type: z.literal("app_mention"),
  user: z.string(),
  ts: z.string(),
  client_msg_id: z.string().optional(), // ✅ Optional
  text: z.string(),
  team: z.string(),
  thread_ts: z.string().optional(),
  parent_user_id: z.string().optional(),
  blocks: z.array(z.any()),
  channel: z.string(),
  assistant_thread: z.any().optional(),
  attachments: z.array(z.any()).optional(), // ✅ Added
  event_ts: z.string(),
});
```

Also updated the TypeScript interface for `processSlackAppMentionEvent` (lines 83-97) to match.

## Verification

Created test script `/tmp/test_schema.ts` that successfully validates the previously failing event against the updated schema:

```bash
$ bun /tmp/test_schema.ts
✅ SUCCESS! Event matches the schema.
```

---

## Fix 2: Handle Slack WebSocket System Messages

### Problem

The bot was logging normal Slack WebSocket protocol messages as unmatched:

```json
{
  "type": "hello",
  "num_connections": 1,
  "debug_info": {
    "host": "applink-6",
    "build_number": 8,
    "approximate_connection_time": 18060
  },
  "connection_info": {
    "app_id": "A078498JA5T"
  }
}
```

The "hello" message is sent by Slack to acknowledge a successful WebSocket connection.

### Root Cause

The WebSocket message handler only tried to parse `app_mention` events and logged everything else as unmatched.

### Solution

Added proper handling for different Slack WebSocket message types in `bot/index.ts` (lines 65-105):

```typescript
ws.onmessage = async ({ data }) => {
    const parsed = JSON.parse(data)
    let handled = false;

    // 1. Handle "hello" message (connection acknowledgment)
    if (parsed.type === 'hello') {
        console.log('[Slack WebSocket] Connection acknowledged:', {...});
        handled = true;
    }

    // 2. Handle "disconnect" message
    if (parsed.type === 'disconnect') {
        console.log('[Slack WebSocket] Disconnect message:', parsed.reason);
        handled = true;
    }

    // 3. Handle "events_api" messages with app_mention events
    if (parsed.type === 'events_api' && parsed.payload?.event) {
        // Parse and process app_mention events
        handled = await zAppMentionEvent.parseAsync(...)...
    }

    // Log only truly unhandled messages
    if (!handled) {
        console.log('MSG_NOT_MATCHED: ' + JSON.stringify(data));
    }
}
```

### Verification

Created test script `/tmp/test_hello_msg.ts`:

```bash
$ bun /tmp/test_hello_msg.ts
[Slack WebSocket] Connection acknowledged: { connections: 1, host: "applink-6" }
Result: ✅ Handled
```

## Files Modified

- `bot/index.ts`:
  - Lines 35-49: Updated Zod schema for app_mention events
  - Lines 65-105: Added WebSocket message type handlers
  - Lines 117-126: Updated TypeScript interface

## References

- Slack Events API: https://api.slack.com/events/app_mention
- Slack WebSocket API: https://api.slack.com/apis/connections/socket
- The `client_msg_id` field is documented as optional for app_mention events
- Events with message unfurls include an `attachments` array
