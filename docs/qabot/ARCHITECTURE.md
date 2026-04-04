# QA Bot — Architecture

## System Overview

QA Bot follows the same **master-worker pattern** as the existing prbot system. The master bot (ComfyPR Bot) handles coordination, and a specialized QA sub-agent does the actual browser work.

## Components

### 1. QA Orchestrator (`bot/qa/orchestrator.ts`)

The entry point that receives QA tasks and manages the lifecycle:

- Parses the task (issue URL, PR URL, Slack message, or free-form prompt)
- Resolves the target repository and branch
- Determines QA type: `reproduce` | `verify` | `smoke` | `demo`
- Spawns the QA Agent in an isolated environment
- Collects results and dispatches reports

### 2. QA Agent (`bot/qa/qa-agent.ts`)

The AI-driven sub-agent that performs the actual QA work:

- **Research Phase**: Reads issue/PR description, inspects codebase, understands expected behavior
- **Setup Phase**: Boots the target app (dev server), waits for ready
- **Execute Phase**: Drives browser via Playwright, writes/runs E2E tests, captures evidence
- **Report Phase**: Compiles findings into structured output

### 3. App Bootstrap (`bot/qa/bootstrap/`)

Per-repo configuration for how to start and ready-check each target app:

```
bot/qa/bootstrap/
├── index.ts                    # Registry + auto-detect
├── comfyui-frontend.ts         # npm run dev, wait for :5173
├── comfyui-desktop.ts          # electron app startup
├── generic-nextjs.ts           # next dev, wait for :3000
├── generic-vite.ts             # vite dev, wait for :5173
└── types.ts                    # AppBootstrap interface
```

Each bootstrap module exports:

```typescript
interface AppBootstrap {
  name: string;
  detect: (repoDir: string) => Promise<boolean>;  // auto-detect from repo
  install: (repoDir: string) => Promise<void>;     // install deps
  start: (repoDir: string) => Promise<AppProcess>; // start dev server
  readyCheck: (url: string) => Promise<boolean>;   // is app ready?
  baseUrl: string;                                  // default URL
  cleanup: () => Promise<void>;                     // teardown
}
```

### 4. Browser Controller (`bot/qa/browser/`)

Manages browser lifecycle and recording:

```
bot/qa/browser/
├── controller.ts       # Browser launch, context, page management
├── recorder.ts         # Video recording with quality settings
├── screenshotter.ts    # Screenshot capture with annotations
├── a11y-inspector.ts   # Accessibility tree inspection for AI navigation
└── types.ts
```

### 5. Video Pipeline (`bot/qa/video/`)

Post-processing and delivery of recorded videos:

```
bot/qa/video/
├── recorder.ts         # Playwright video recording wrapper
├── compositor.ts       # Combine multiple clips, add overlays
├── uploader.ts         # Upload to GCS / GitHub artifacts
├── thumbnail.ts        # Generate thumbnail from video
└── types.ts
```

### 6. Report Engine (`bot/qa/report/`)

Generates and delivers structured QA reports:

```
bot/qa/report/
├── generator.ts        # Markdown report generation
├── github-commenter.ts # Post to GitHub issues/PRs
├── slack-poster.ts     # Post to Slack with video
├── badge.ts            # Generate status badges
└── types.ts
```

## Data Flow

```
┌─────────────┐
│   Trigger    │  (Slack msg / GH webhook / CLI / cron)
└──────┬──────┘
       ▼
┌──────────────────────────────────────────────┐
│              QA Orchestrator                  │
│                                              │
│  1. Parse task → { repo, ref, type, context }│
│  2. Clone/checkout repo to /bot/qa-runs/     │
│  3. Detect app type → select bootstrap       │
│  4. Spawn QA Agent                           │
└──────┬───────────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────┐
│              QA Agent (sub-process)           │
│                                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  │
│  │ Research  │→ │  Execute   │→ │  Report  │  │
│  │          │  │           │  │          │  │
│  │ Read issue│  │ Boot app  │  │ Compile  │  │
│  │ Analyze  │  │ Drive     │  │ findings │  │
│  │ code     │  │ browser   │  │ Generate │  │
│  │ Plan test│  │ Record    │  │ video    │  │
│  │          │  │ video     │  │ badge    │  │
│  └──────────┘  └───────────┘  └──────────┘  │
└──────┬───────────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────┐
│              Report Delivery                  │
│                                              │
│  → GitHub Issue/PR comment with badge + video │
│  → Slack thread reply with video attachment    │
│  → Artifact store (GCS bucket, 14-day TTL)    │
└──────────────────────────────────────────────┘
```

## Isolation Model

Each QA run gets an isolated workspace:

```
/bot/qa-runs/
└── {run-id}/                      # UUID per run
    ├── repo/                      # Cloned target repository
    ├── artifacts/                 # Collected evidence
    │   ├── videos/               # Recorded .webm/.mp4 files
    │   ├── screenshots/          # Captured .png files
    │   ├── test-results/         # Playwright test output
    │   └── logs/                 # App server logs, browser console
    ├── report.md                 # Generated report
    └── metadata.json             # Run metadata (timing, verdict, etc.)
```

## Environment Requirements

### Display Server (for headed browser)

QA Bot runs Playwright in **headed mode** with a virtual display for high-quality video:

```bash
# Xvfb virtual framebuffer (Linux)
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99
```

### Dependencies

- **Playwright**: Browser automation + video recording
- **ffmpeg**: Video post-processing (concatenation, overlays, compression)
- **Xvfb**: Virtual display server (Linux, for headed mode)
- **Bun**: Runtime for all TypeScript scripts

## Configuration

QA Bot configuration lives in `bot/qa/config.ts`:

```typescript
interface QAConfig {
  // Video
  videoResolution: { width: number; height: number };  // 1920x1080
  videoFps: number;                                      // 30
  maxRecordingDuration: number;                          // 5 minutes
  videoFormat: 'webm' | 'mp4';

  // Timeouts
  appBootTimeout: number;      // 120s
  testTimeout: number;         // 300s
  totalRunTimeout: number;     // 600s

  // Storage
  artifactBucket: string;      // GCS bucket name
  artifactTTL: number;         // 14 days
  maxArtifactSize: number;     // 100MB per run

  // Agent
  agentModel: string;          // claude-sonnet-4-20250514
  maxAgentIterations: number;  // 30
}
```

## Integration with Existing Bot

QA Bot plugs into the existing ComfyPR Bot architecture:

1. **CLI**: New `prbot qa` command in `bot/cli.ts`
2. **Slack Handler**: New intent detection in `bot/index.ts` for QA-related mentions
3. **GitHub Webhook**: New handler in `gh-service/` for issue/PR label triggers
4. **Shared Infrastructure**: Uses existing Slack posting, GitHub API, state management
