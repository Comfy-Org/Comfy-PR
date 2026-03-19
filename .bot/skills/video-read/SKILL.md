---
name: video-read
description: Analyze video files (screen recordings, demos, walkthroughs) using AI vision models. Use when you need to understand, describe, or extract information from video content. Supports local files and Slack-hosted videos.
allowed-tools: Bash
model: haiku
---

# Video Read

Analyze video files using Gemini 2.5 Flash (native video understanding) or GPT-4o (frame extraction fallback).

## Usage

**Local video file:**

```bash
bun ../bot/cli.ts video read -f <video_path> [-m gemini|gpt4o] [-p "custom prompt"]
```

**Slack file by ID:**

```bash
bun ../bot/cli.ts video read --slack-file <FILE_ID> [-m gemini|gpt4o] [-p "custom prompt"]
```

**Slack file by URL:**

```bash
bun ../bot/cli.ts video read --slack-url "<SLACK_FILE_URL>" [-m gemini|gpt4o] [-p "custom prompt"]
```

## Parameters

- `-f, --file`: Local video file path (.mp4, .webm, .mov, .avi, .mkv)
- `--slack-file`: Slack file ID (auto-downloads then analyzes)
- `--slack-url`: Slack file URL (auto-downloads then analyzes)
- `-m, --model`: AI model to use (default: `gemini`)
  - `gemini` — Gemini 2.5 Flash with native video understanding (recommended)
  - `gpt4o` — GPT-4o with frame extraction via ffmpeg
- `-p, --prompt`: Custom analysis prompt (optional)

**Note**: Exactly one of `--file`, `--slack-file`, or `--slack-url` must be provided.

## Examples

```bash
# Analyze a screen recording with Gemini (default)
bun ../bot/cli.ts video read -f ./recording.mp4

# Use GPT-4o fallback
bun ../bot/cli.ts video read -f ./demo.mp4 -m gpt4o

# Analyze a Slack-shared video by file ID
bun ../bot/cli.ts video read --slack-file F0AMXCK3JQ1

# Custom prompt for bug analysis
bun ../bot/cli.ts video read -f ./bug.mp4 -p "What bug is shown? Steps to reproduce?"
```

## Output

Detailed text description of the video content, followed by model and usage metadata.

## Notes

- Gemini sends full video as base64 — best temporal understanding
- GPT-4o extracts frames at 1fps via ffmpeg, samples every other — requires ffmpeg
- Supported: .mp4, .webm, .mov, .avi, .mkv, .m4v
- Env vars: `GEMINI_API_KEY` for Gemini, `OPENAI_API_KEY` for GPT-4o
