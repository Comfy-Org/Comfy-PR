# Smart Read Feature - Summary

## Overview

Added a new smart `prbot slack read <url>` command that auto-detects Slack URL types and handles them appropriately, making it much easier to interact with Slack content.

## Key Features

### 1. Auto-Detection of URL Types

The command automatically detects three types of Slack URLs:

- **Message URLs**: Reads nearby messages (20 before + 20 after) with target highlighted
- **Channel URLs**: Reads recent 10 messages from the channel
- **File URLs**: Downloads file to current directory and returns path info

### 2. Simple Syntax

```bash
# One command for everything!
prbot slack read "<slack_url>"
```

No more remembering different flags for different operations!

### 3. YAML Output

All Slack commands now output YAML format (instead of JSON) for better readability by both humans and AI agents.

## Examples

### Message URL
```bash
$ prbot slack read "https://workspace.slack.com/archives/C123/p1234567890"
```

**Output:** YAML with 40 messages (20 before + 20 after), target message has `is_target: true`

### Channel URL
```bash
$ prbot slack read "https://workspace.slack.com/archives/C123"
```

**Output:** YAML with 10 most recent messages from the channel

### File URL
```bash
$ prbot slack read "https://files.slack.com/files-pri/T123-F456/report.pdf"
```

**Output:** YAML with download info:
```yaml
type: file_downloaded
file_id: F456
file_name: report.pdf
file_size: 12345
downloaded_to: ./report.pdf
```

## Implementation

### New Files Created

1. **lib/slack/parseSlackUrlSmart.ts**
   - Smart URL parser that detects message/file/channel URLs
   - Returns structured data with type and extracted info

2. **lib/slack/msg-read-recent.ts**
   - Function to read recent messages from a channel
   - Outputs YAML format

### Modified Files

1. **bot/cli.ts**
   - Added `prbot slack read <url>` command
   - Updated all Slack commands to output YAML instead of JSON
   - Imported new smart URL parser

2. **.bot/AGENT.md** (and symlinked README.md, CLAUDE.md)
   - Added documentation for smart read command
   - Updated output format mentions from JSON to YAML
   - Added as recommended method at top of Slack commands section

3. **CLAUDE.md** (root)
   - Added smart read command documentation
   - Updated usage patterns to use the new command
   - Updated implementation details

## Benefits

### For Humans
- **Easier to type**: Just paste the Slack URL, no need to extract channel/timestamp
- **One command to remember**: Instead of `read-thread`, `read-nearby`, `download-file`, etc.
- **Better readability**: YAML output is more human-friendly than JSON

### For AI Agents
- **Simpler integration**: Single command interface for all Slack read operations
- **Better parsing**: YAML is easier to parse and work with than JSON
- **Consistent output**: All commands follow the same format

## Testing

All URL types parse correctly:

```bash
# Message URL
$ bun lib/slack/parseSlackUrlSmart.ts "https://workspace.slack.com/archives/C123/p1234567890"
{"type":"message","channel":"C123","ts":"1234567890.123456","url":"..."}

# Channel URL
$ bun lib/slack/parseSlackUrlSmart.ts "https://workspace.slack.com/archives/C123"
{"type":"channel","channel":"C123","url":"..."}

# File URL
$ bun lib/slack/parseSlackUrlSmart.ts "https://files.slack.com/files-pri/T123-F456/file.pdf"
{"type":"file","fileId":"F456","url":"..."}
```

## Command Help

```
$ prbot slack --help

Commands:
  prbot slack read <url>       Smart read: Auto-detect URL type (message/file/channel)
                               and read appropriately (YAML output)
  prbot slack update           Update a Slack message
  prbot slack read-thread      Read and print a Slack thread (YAML)
  prbot slack read-nearby      Read nearby messages around a specific timestamp
  prbot slack download-file    Download a file from Slack
  prbot slack file-info        Get information about a Slack file (YAML)
  prbot slack post-with-files  Post a message with file attachments
  prbot slack upload-file      Upload a file to Slack
```

## Backward Compatibility

All existing commands (`read-thread`, `read-nearby`, `download-file`, etc.) still work exactly as before, just with YAML output instead of JSON. The new `read` command is additive and doesn't break any existing functionality.
