# QA Bot — Automated Visual QA & Video Evidence System

## Vision

QA Bot is a sub-agent of ComfyPR-Bot that **automatically reproduces bugs, verifies features, and records high-quality video evidence** for any frontend repository. It posts results back to GitHub Issues/PRs and Slack threads as rich reports with embedded video, screenshots, and reproduction steps.

Unlike the prototype in [ComfyUI_frontend PR #9430](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9430) which is tightly coupled to one repo's CI, QA Bot lives in Comfy-PR as a **centralized service** that can target any repo — ComfyUI_frontend, desktop, registry, docs, or any web-based project.

## Key Differentiators from PR #9430

| Aspect | PR #9430 (Frontend-only) | QA Bot (This) |
|---|---|---|
| **Scope** | Single repo CI workflow | Centralized service for all repos |
| **Trigger** | GitHub Actions label/PR event | Slack mentions, GitHub webhooks, CLI, cron |
| **Video** | Basic Playwright recording | High-quality narrated demo/repro videos |
| **Output** | Cloudflare Pages badge | GitHub comments, Slack posts, artifact store |
| **Agent** | Claude in CI | prbot sub-agent with browser automation |
| **Isolation** | Runs in GH Actions runner | Runs in dedicated GCP container with display server |

## What QA Bot Does

1. **Bug Reproduction** — Given a GitHub issue, reads the description, spins up the target app, reproduces the bug in a real browser, records video evidence
2. **Feature Verification** — Given a PR, deploys the branch, runs through the changed features, records before/after demo videos
3. **Regression Testing** — Runs smoke tests across key user journeys and records video proof
4. **Report Generation** — Posts structured reports with video, screenshots, verdict badges, and reproduction steps to GitHub and Slack

## Documentation Index

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, components, data flow |
| [TRIGGERS.md](./TRIGGERS.md) | How QA tasks get initiated |
| [VIDEO-RECORDING.md](./VIDEO-RECORDING.md) | Video capture pipeline and quality standards |
| [BROWSER-AUTOMATION.md](./BROWSER-AUTOMATION.md) | Browser control strategy (Playwright + AI) |
| [REPO-SUPPORT.md](./REPO-SUPPORT.md) | Multi-repo support and app bootstrapping |
| [REPORTING.md](./REPORTING.md) | Output formats and delivery channels |
| [CLI-SPEC.md](./CLI-SPEC.md) | `prbot qa` CLI command specification |
| [ROADMAP.md](./ROADMAP.md) | Implementation phases and milestones |

## Quick Example

```bash
# Reproduce a bug from a GitHub issue
prbot qa reproduce --issue=Comfy-Org/ComfyUI_frontend#10688

# Verify a PR's changes with before/after video
prbot qa verify --pr=Comfy-Org/ComfyUI_frontend#9500

# Run smoke test suite on a branch
prbot qa smoke --repo=Comfy-Org/ComfyUI_frontend --branch=main

# QA from a Slack message (bot parses the context)
@ComfyPR-Bot qa this bug ^^ (replying to a Slack message with bug details)
```

## Architecture at a Glance

```
Slack / GitHub / CLI
        │
        ▼
┌──────────────────┐
│  ComfyPR Master  │  (research & coordination)
│    Bot Agent     │
└───────┬──────────┘
        │ spawns
        ▼
┌──────────────────┐     ┌─────────────────┐
│   QA Sub-Agent   │────▶│  Target App     │
│  (qa-agent.ts)   │     │  (dev server)   │
│                  │     └─────────────────┘
│  ┌────────────┐  │
│  │ Playwright │  │──── video recording
│  │ + Browser  │  │──── screenshots
│  └────────────┘  │──── E2E test execution
└───────┬──────────┘
        │ results
        ▼
┌──────────────────┐
│  Report Engine   │──▶ GitHub comment + Slack post
│  (qa-report.ts)  │──▶ Video upload (GCS/artifacts)
└──────────────────┘
```
