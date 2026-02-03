---
name: Slack Thread Messaging
description: Update or append messages in Slack threads for progress updates, clarifications, and final answers.
---

# Slack Thread Messaging

Use these commands to communicate in the current Slack thread:

- Update an existing message in the thread:
  prbot slack update --channel <channel_id> --ts <message_ts> --text "<message_text>"

- Read the latest context from a thread root (useful before replying):
  prbot slack read-thread --channel <channel_id> --ts <root_ts> --limit 100

Examples:
prbot slack update --channel ${EVENT_CHANNEL} --ts ${QUICK_RESPOND_MSG_TS} --text "Working on it..."
prbot slack read-thread --channel ${EVENT_CHANNEL} --ts ${EVENT_THREAD_TS} --limit 50

Guidelines:

  prbot slack update --channel ${EVENT_CHANNEL} --ts ${QUICK_RESPOND_MSG_TS} --text "Working on it..."
  prbot slack read-thread --channel ${EVENT_CHANNEL} --ts ${EVENT_THREAD_TS} --limit 50

Guidelines:
- Acknowledge quickly; post iterative, concise updates.
- Prefer editing your last progress message instead of spamming.
- Quote or link to relevant messages for clarity.
