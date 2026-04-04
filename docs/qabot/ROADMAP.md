# QA Bot — Implementation Roadmap

## Phase 0: Foundation (Week 1)

**Goal**: Minimal end-to-end pipeline — reproduce one bug on one repo, post text report to GitHub.

### Tasks

- [ ] Create `bot/qa/` directory structure
- [ ] Implement `bot/qa/orchestrator.ts` — parse issue URL, clone repo, spawn agent
- [ ] Implement `bot/qa/bootstrap/comfyui-frontend.ts` — install, start dev server, ready check
- [ ] Implement `bot/qa/browser/controller.ts` — launch Playwright, basic page interactions
- [ ] Implement `bot/qa/qa-agent.ts` — AI agent loop: read issue → drive browser → determine verdict
- [ ] Implement `bot/qa/report/github-commenter.ts` — post text-only report to GitHub issue
- [ ] Add `prbot qa reproduce --issue=...` CLI command
- [ ] Test with real issue: `Comfy-Org/ComfyUI_frontend#10688`

### Deliverables

- `prbot qa reproduce --issue=Comfy-Org/ComfyUI_frontend#10688` works end-to-end
- Text report posted as GitHub issue comment
- No video yet, just verdict + screenshots

### Dependencies

- Playwright installed in environment
- `ANTHROPIC_API_KEY` for AI agent
- `GH_TOKEN` for GitHub API

---

## Phase 1: Video Recording (Week 2)

**Goal**: Add video recording and delivery.

### Tasks

- [ ] Implement `bot/qa/browser/recorder.ts` — Playwright video recording with quality settings
- [ ] Implement `bot/qa/video/recorder.ts` — start/stop recording, save to artifacts dir
- [ ] Implement cursor visualization (inject CSS overlay for visible cursor)
- [ ] Set up Xvfb virtual display for headed recording on Linux
- [ ] Implement `bot/qa/video/uploader.ts` — upload to GCS with signed URLs
- [ ] Update GitHub commenter to embed video links in reports
- [ ] Implement `bot/qa/report/slack-poster.ts` — post report + video to Slack
- [ ] Install and configure ffmpeg for post-processing

### Deliverables

- Bug reproduction produces HD video (1920×1080, 30fps)
- Video uploaded to GCS and linked in GitHub comment
- Video also posted to Slack if `--post-slack` specified

---

## Phase 2: PR Verification (Week 3)

**Goal**: Before/after comparison for PRs.

### Tasks

- [ ] Implement PR verification flow in orchestrator:
  1. Checkout base branch → boot app → record "before"
  2. Checkout head branch → boot app → record "after"
  3. Compare results → generate verdict
- [ ] Implement `bot/qa/video/compositor.ts` — concatenate before/after with title cards
- [ ] Add `prbot qa verify --pr=...` CLI command
- [ ] Add GitHub Check Run creation for PR-triggered QA
- [ ] Implement verdict badge generation
- [ ] Implement label management (add/remove `qa:*` labels)

### Deliverables

- `prbot qa verify --pr=Comfy-Org/ComfyUI_frontend#9500` works
- Before/after comparison video with title cards
- GitHub Check Run shows pass/fail
- Labels updated on PR

---

## Phase 3: Multi-Repo & Triggers (Week 4)

**Goal**: Support multiple repos and automated triggers.

### Tasks

- [ ] Implement auto-detection bootstrap system (`bot/qa/bootstrap/index.ts`)
- [ ] Add Next.js bootstrap (`bot/qa/bootstrap/generic-nextjs.ts`)
- [ ] Add Vite bootstrap (`bot/qa/bootstrap/generic-vite.ts`)
- [ ] Implement `.qabot.yaml` config file parsing
- [ ] Add GitHub webhook handler for `qa:*` labels in `gh-service/`
- [ ] Add Slack intent detection for QA commands in `bot/index.ts`
- [ ] Add `/qa` GitHub comment command handler
- [ ] Implement rate limiting and deduplication
- [ ] Test on `Comfy-Org/registry` and `Comfy-Org/docs`

### Deliverables

- QA works on any Vite or Next.js repo under Comfy-Org
- Triggerable from Slack, GitHub labels, GitHub comments, and CLI
- Rate limiting prevents abuse

---

## Phase 4: Smoke Tests & Scheduling (Week 5)

**Goal**: Automated periodic smoke tests and the `smoke` command.

### Tasks

- [ ] Implement smoke test suite runner
- [ ] Define default smoke test plans per repo type
- [ ] Add `prbot qa smoke` CLI command
- [ ] Implement cron scheduler for nightly smoke tests
- [ ] Create `bot/qa/schedules.yaml` for schedule definitions
- [ ] Implement smoke test report aggregation (multi-area summary)
- [ ] Add `prbot qa list` and `prbot qa artifacts` commands

### Deliverables

- Nightly smoke tests run on ComfyUI_frontend main branch
- Reports posted to `#qa-reports` Slack channel
- Historical run listing and artifact retrieval

---

## Phase 5: High-Quality Video Production (Week 6-7)

**Goal**: Broadcast-quality demo videos with post-processing.

### Tasks

- [ ] Implement title card generation with Canvas API
- [ ] Implement video post-processing pipeline (ffmpeg):
  - Add title cards and end cards
  - Add timestamp watermark
  - Compress to target bitrate
  - Generate thumbnails
- [ ] Implement `prbot qa demo` command
- [ ] Add narration support (text overlay explaining each step)
- [ ] Optimize cursor visualization for smooth, natural movement
- [ ] Implement `bot/qa/video/compositor.ts` — multi-clip composition

### Deliverables

- Demo videos with professional title cards and smooth transitions
- Text overlays explaining what's happening
- Thumbnail generation for Slack/GitHub previews
- `prbot qa demo` produces stakeholder-ready videos

---

## Phase 6: Desktop App & Electron Support (Week 8)

**Goal**: QA support for Comfy-Org/desktop Electron app.

### Tasks

- [ ] Implement `bot/qa/bootstrap/comfyui-desktop.ts` with Electron launch
- [ ] Handle Electron-specific Playwright APIs
- [ ] Test on desktop app with common user journeys
- [ ] Handle desktop-specific UI elements (native menus, dialogs, system tray)

### Deliverables

- QA Bot can test the desktop Electron app
- Video recording works with Electron windows

---

## Phase 7: Advanced Features (Week 9+)

### Planned

- [ ] **Flaky test detection**: Track test pass rates over time, flag flaky tests
- [ ] **Visual regression**: Screenshot comparison between branches using pixel diff
- [ ] **Performance monitoring**: Measure and report page load times, interaction latency
- [ ] **Accessibility audit**: Run axe-core during QA runs, report a11y issues
- [ ] **Custom test suites**: Allow repos to define their own QA test suites
- [ ] **QA Dashboard**: Web UI showing run history, trends, and artifacts
- [ ] **PR auto-label**: Automatically label PRs based on QA results
- [ ] **Integration tests**: Test frontend + backend together (not just mock)

---

## Tech Stack Summary

| Component | Technology |
|---|---|
| Runtime | Bun |
| Browser automation | Playwright |
| AI agent | Claude Sonnet (via Anthropic API) |
| Video recording | Playwright built-in + ffmpeg post-processing |
| Display server | Xvfb (Linux) |
| Artifact storage | Google Cloud Storage |
| CLI | yargs (integrated in `bot/cli.ts`) |
| GitHub integration | Octokit / `gh` CLI |
| Slack integration | Slack Web API (existing `lib/slack/`) |

---

## Success Metrics

| Metric | Phase 0 | Phase 2 | Phase 5 |
|---|---|---|---|
| Repos supported | 1 | 2+ | 5+ |
| Bug reproduction accuracy | 60% | 75% | 85% |
| Time to first report | 5 min | 3 min | 2 min |
| Video quality | None | HD | HD + overlays |
| Trigger methods | CLI only | CLI + GitHub | All |
| Daily automated runs | 0 | 0 | 3+ |
