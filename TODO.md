# QA Bot — TODO

## Principles

1. **Ship incrementally** — each task produces a runnable artifact; no big-bang integration
2. **Reuse existing infra** — use existing `lib/slack/`, `lib/video/`, `src/cli/echoBunShell`, prbot patterns
3. **Convention over configuration** — auto-detect repo type; `.qabot.yaml` optional override
4. **Evidence-first QA** — every verdict must have video or E2E test proof attached
5. **Isolation** — each QA run gets its own workspace under `/bot/qa-runs/{run-id}/`
6. **Fail fast, report always** — even crashes produce a partial report with whatever evidence was collected
7. **Single responsibility per file** — one concern per module, clear interfaces via `types.ts`

---

## Phase 0 — Foundation

### Core Types & Config
- [x] `bot/qa/types.ts` — shared types (QATask, QAResult, Verdict, AppBootstrap, etc.)
- [x] `bot/qa/config.ts` — default config (timeouts, resolution, paths, models)

### Orchestrator
- [x] `bot/qa/orchestrator.ts` — parse task, clone repo, detect bootstrap, spawn agent, collect results

### App Bootstrap
- [x] `bot/qa/bootstrap/types.ts` — AppBootstrap interface
- [x] `bot/qa/bootstrap/index.ts` — auto-detect registry
- [x] `bot/qa/bootstrap/comfyui-frontend.ts` — Vue+Vite, mock backend
- [x] `bot/qa/bootstrap/generic-vite.ts` — generic Vite project
- [x] `bot/qa/bootstrap/generic-nextjs.ts` — generic Next.js project

### Browser & Recording
- [x] `bot/qa/browser/controller.ts` — launch Playwright, manage context/page, cursor injection
- [x] `bot/qa/browser/recorder.ts` — start/stop video recording, screenshot capture

### QA Agent
- [x] `bot/qa/qa-agent.ts` — AI agent loop: research → execute → verdict

### Reporting
- [x] `bot/qa/report/generator.ts` — produce markdown report from QAResult
- [x] `bot/qa/report/github-commenter.ts` — post report as GitHub issue/PR comment

### CLI
- [x] `bot/qa/cli.ts` — `prbot qa reproduce|verify|smoke|demo|run` commands
- [x] Wire into `bot/cli.ts` as `qa` command group

### Install
- [x] Add `playwright` dependency

---

## Phase 1 — Video & Delivery (next)
- [ ] `bot/qa/video/encoder.ts` — ffmpeg post-processing (title cards, compression)
- [ ] `bot/qa/video/uploader.ts` — upload to GCS with signed URLs
- [ ] `bot/qa/report/slack-poster.ts` — post report + video to Slack thread
- [ ] Xvfb integration for headed recording in CI/GCP

## Phase 2 — PR Verification
- [ ] Before/after flow in orchestrator (checkout base → record → checkout head → record → compare)
- [ ] `bot/qa/video/compositor.ts` — concatenate before/after with title cards
- [ ] GitHub Check Run integration
- [ ] Label management (add/remove `qa:*` labels)

## Phase 3 — Multi-Repo & Triggers
- [ ] GitHub webhook handler in `gh-service/` for `qa:*` labels
- [ ] Slack intent detection in `bot/index.ts` for QA mentions
- [ ] `/qa` GitHub comment command handler
- [ ] Rate limiting & deduplication
- [ ] `.qabot.yaml` config file parsing

## Phase 4 — Smoke Tests & Scheduling
- [ ] Default smoke test suites per repo type
- [ ] Cron scheduler for nightly runs
- [ ] `prbot qa list` and `prbot qa artifacts` commands

## Phase 5 — High-Quality Video Production
- [ ] Title card generation with Canvas API
- [ ] Text overlay narration
- [ ] Thumbnail generation
- [ ] `prbot qa demo` full polish

## Phase 6 — Desktop & Electron
- [ ] `bot/qa/bootstrap/comfyui-desktop.ts`
- [ ] Electron-specific Playwright handling

## Phase 7 — Advanced
- [ ] Flaky test detection
- [ ] Visual regression (pixel diff)
- [ ] Performance monitoring
- [ ] Accessibility audit (axe-core)
- [ ] QA Dashboard web UI
