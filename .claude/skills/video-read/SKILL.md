---
name: video-read
description: Analyze video files (screen recordings, demos, walkthroughs) using AI vision models. Use when the user wants to understand, describe, or extract information from video content. Supports local files and Slack-hosted videos.
allowed-tools: Bash
model: haiku
---

# Video Read

Analyze video files using Gemini 2.5 Flash (native video understanding) or GPT-4o (frame extraction fallback).

## Usage

**Local video file:**

```bash
prbot video read -f <video_path> [-m gemini|gpt4o] [-p "custom prompt"]
```

**Slack file by ID:**

```bash
prbot video read --slack-file <FILE_ID> [-m gemini|gpt4o] [-p "custom prompt"]
```

**Slack file by URL:**

```bash
prbot video read --slack-url "<SLACK_FILE_URL>" [-m gemini|gpt4o] [-p "custom prompt"]
```

## Parameters

- `-f, --file`: Local video file path (.mp4, .webm, .mov, .avi, .mkv)
- `--slack-file`: Slack file ID (auto-downloads then analyzes)
- `--slack-url`: Slack file URL (auto-downloads then analyzes)
- `-m, --model`: AI model to use (default: `gemini`)
  - `gemini` — Gemini 2.5 Flash with native video understanding (recommended)
  - `gpt4o` — GPT-4o with frame extraction via ffmpeg
- `-p, --prompt`: Custom analysis prompt (optional, default focuses on step-by-step actions, UI state, errors)

**Note**: Exactly one of `--file`, `--slack-file`, or `--slack-url` must be provided.

## Examples

```bash
# Analyze a screen recording with Gemini (default, best quality)
prbot video read -f ./recording.mp4

# Use GPT-4o fallback
prbot video read -f ./demo.mp4 -m gpt4o

# Analyze a video shared in Slack
prbot video read --slack-file F0AMXCK3JQ1

# Custom analysis prompt
prbot video read -f ./bug-repro.mp4 -p "What bug is being demonstrated? What are the exact steps to reproduce it?"
```

## Output

Outputs a detailed text description of the video content, followed by model and usage metadata.

## Notes

- Gemini path sends the full video as base64 inline data — best for understanding temporal changes
- GPT-4o path extracts frames at 1fps with ffmpeg, samples every other frame — requires ffmpeg installed
- Supported formats: .mp4, .webm, .mov, .avi, .mkv, .m4v
- Requires `GEMINI_API_KEY` env var for Gemini, `OPENAI_API_KEY` for GPT-4o
