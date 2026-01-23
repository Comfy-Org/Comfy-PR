---
name: slack-thread-reader
description: Read and retrieve messages from Slack threads. Use when the user wants to view, analyze, or extract conversation history from a Slack thread by providing channel ID and thread timestamp, or a Slack message URL.
allowed-tools: Bash
model: haiku
---

# Slack Thread Reader

This skill reads all messages from a Slack thread and outputs them as structured JSON.

## Usage

**Option 1: Using Slack URL**

```bash
prbot slack read-thread -u "<SLACK_MESSAGE_URL>" [-l <NUMBER>]
```

**Option 2: Using Channel ID and Timestamp**

```bash
prbot slack read-thread -c <CHANNEL_ID> -t <THREAD_TS> [-l <NUMBER>]
```

## Parameters

### URL Format

- `-u, --url` (required if not using channel+ts): Slack message URL
- `-l, --limit` (optional): Maximum number of messages to retrieve (default: 100)

### Channel/Timestamp Format

- `-c, --channel` (required if not using url): Slack channel ID (e.g., `C123456789`)
- `-t, --ts` (required if not using url): Thread timestamp (parent message timestamp)
- `-l, --limit` (optional): Maximum number of messages to retrieve (default: 100)

**Note**: You must use either `--url` OR `--channel` + `--ts`, not both.

## Output Format

Returns JSON array with each message containing:

- `username`: Display name of the message author
- `text`: Original Slack-formatted text
- `markdown`: Converted markdown text (with user mentions, formatting, etc.)

## Examples

```bash
# Read thread using Slack URL (easiest)
prbot slack read-thread -u "https://workspace.slack.com/archives/C123/p1234567890"

# Read thread using Slack URL with thread_ts parameter
prbot slack read-thread -u "https://workspace.slack.com/archives/C123/p1234567890?thread_ts=1234567890.123456"

# Read thread using channel ID and timestamp
prbot slack read-thread -c C07V123ABC -t 1234567890.123456

# Read first 20 messages only
prbot slack read-thread -c C07V123ABC -t 1234567890.123456 -l 20
```

## Supported URL Formats

The tool automatically parses various Slack URL formats:

- `https://WORKSPACE.slack.com/archives/CHANNEL/pTIMESTAMP`
- `https://WORKSPACE.slack.com/archives/CHANNEL/pTIMESTAMP?thread_ts=THREAD_TS`
- `https://app.slack.com/client/TEAM/CHANNEL/TIMESTAMP`

## Notes

- Requires `channels:history` or `groups:history` Slack OAuth scope
- Automatically converts Slack formatting to markdown
- Handles user mentions, channel links, URLs, and text formatting
