---
name: Slack File Sharing
description: Upload files and share deliverables with users in Slack threads.
---

# Slack File Sharing

Use this command to upload files in Slack:

## Upload a file to thread:

prbot slack upload --channel <channel_id> --file <file_path> --comment "<message>" --thread <thread_ts>

Examples:
prbot slack upload --channel ${EVENT_CHANNEL} --file ./report.md --comment "Analysis complete" --thread ${QUICK_RESPOND_MSG_TS}
prbot slack upload --channel ${EVENT_CHANNEL} --file ./data.json --comment "Here is the data" --thread ${QUICK_RESPOND_MSG_TS}

## When to upload files:

  prbot slack upload --channel <channel_id> --file <file_path> --comment "<message>" --thread <thread_ts>

Examples:
  prbot slack upload --channel ${EVENT_CHANNEL} --file ./report.md --comment "Analysis complete" --thread ${QUICK_RESPOND_MSG_TS}
  prbot slack upload --channel ${EVENT_CHANNEL} --file ./data.json --comment "Here is the data" --thread ${QUICK_RESPOND_MSG_TS}

## When to upload files:
- Reports, analysis results, or documentation (.md, .pdf, .txt)
- Code samples or scripts (.py, .ts, .js, .sh)
- Diagrams, screenshots, or visualizations (.png, .jpg, .svg)
- Data exports or logs (.json, .csv, .log)
- Any deliverable the user requested

## Best practices:

- ALWAYS upload files to the thread where the user asked the question using --thread parameter
- Use descriptive file names that indicate the content
- Include a meaningful comment explaining what the file contains
- Upload files as soon as they're ready, don't wait until the end
