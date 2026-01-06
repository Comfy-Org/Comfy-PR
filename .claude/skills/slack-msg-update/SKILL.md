---
name: slack-msg-update
description: Update Slack messages in threads. Use when the user wants to edit, modify, or update an existing Slack message by providing channel ID, message timestamp, and new text content.
allowed-tools: Bash
model: haiku
---

# Slack Message Update

This skill updates existing Slack messages in channels or threads.

## Usage

```bash
pr-bot slack update -c <CHANNEL_ID> -t <MESSAGE_TS> -m "<NEW_TEXT>"
```

## Parameters

- `-c, --channel` (required): Slack channel ID (e.g., `C123456789`)
- `-t, --ts` (required): Message timestamp in Slack format (e.g., `1234567890.123456`)
- `-m, --text` (required): New message text to replace the existing content

## Examples

```bash
# Update a message with new status
pr-bot slack update -c C07V123ABC -t 1234567890.123456 -m "Task completed successfully!"

# Update with markdown formatting
pr-bot slack update -c C07V123ABC -t 1234567890.123456 -m "*Bold text* and _italic text_"
```

## Notes

- The bot must have already posted the original message to update it
- Requires `chat:write` Slack OAuth scope
- Supports Slack's mrkdwn formatting
