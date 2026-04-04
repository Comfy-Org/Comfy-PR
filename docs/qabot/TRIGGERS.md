# QA Bot — Triggers

## How QA Tasks Get Initiated

QA Bot supports multiple trigger mechanisms, all funneling into the same QA Orchestrator.

---

## 1. Slack Mention

Users can ask ComfyPR-Bot to QA something directly in Slack:

```
@ComfyPR-Bot qa reproduce https://github.com/Comfy-Org/ComfyUI_frontend/issues/10688
@ComfyPR-Bot can you reproduce this bug? ^^ (replying to a message describing a bug)
@ComfyPR-Bot verify PR https://github.com/Comfy-Org/ComfyUI_frontend/pull/9500
@ComfyPR-Bot demo the new sidebar feature on main
```

### Intent Detection

The master bot detects QA intent from keywords:

- `qa`, `reproduce`, `repro`, `verify`, `test`, `demo`, `record video`, `check this bug`
- Combined with a GitHub issue/PR URL or a bug description in the thread

### Flow

```
Slack mention
  → Master bot detects QA intent
  → Extracts target (issue URL, PR URL, or description)
  → Posts "🔍 Starting QA..." quick response
  → Spawns QA sub-agent
  → Updates Slack thread with progress
  → Posts final report with video to thread
```

---

## 2. GitHub Webhook (Label-Based)

Adding a label to an issue or PR triggers QA:

### Labels

| Label | QA Type | Description |
|---|---|---|
| `qa:reproduce` | Bug reproduction | Reproduce the reported bug with video evidence |
| `qa:verify` | PR verification | Verify the PR's changes with before/after comparison |
| `qa:smoke` | Smoke test | Run standard smoke tests on the PR branch |
| `qa:demo` | Feature demo | Record a demo video of the feature |

### Flow

```
Label added on GitHub issue/PR
  → GitHub webhook → gh-service/
  → QA Orchestrator receives event
  → Runs QA task
  → Posts results as GitHub comment
  → Removes label, adds result label (qa:reproduced / qa:not-reproduced / qa:verified)
```

### Webhook Handler

New webhook handler in `gh-service/`:

```typescript
// gh-service/handlers/qa-label.ts
export async function handleQALabel(event: LabelEvent) {
  const label = event.label.name;
  if (!label.startsWith('qa:')) return;

  const qaType = label.replace('qa:', '') as QAType;
  const target = event.issue || event.pull_request;

  await qaOrchestrator.run({
    type: qaType,
    repo: event.repository.full_name,
    ref: target.head?.ref || target.default_branch,
    issueNumber: target.number,
    issueBody: target.body,
    issueTitle: target.title,
  });
}
```

---

## 3. CLI (`prbot qa`)

Direct CLI invocation for development and testing:

```bash
# Reproduce a specific issue
prbot qa reproduce --issue=Comfy-Org/ComfyUI_frontend#10688

# Verify a PR
prbot qa verify --pr=Comfy-Org/ComfyUI_frontend#9500

# Smoke test a branch
prbot qa smoke --repo=Comfy-Org/ComfyUI_frontend --branch=feature/new-sidebar

# Record a demo of a feature
prbot qa demo --repo=Comfy-Org/ComfyUI_frontend --branch=main --prompt="Demo the template browser"

# Free-form QA task
prbot qa run --repo=Comfy-Org/ComfyUI_frontend --prompt="Check if drag-and-drop works on the canvas"
```

---

## 4. Cron / Scheduled

Periodic smoke tests on main branches:

```yaml
# Defined in bot/qa/schedules.yaml
schedules:
  - name: "Frontend Nightly Smoke"
    cron: "0 2 * * *"      # 2 AM daily
    type: smoke
    repo: Comfy-Org/ComfyUI_frontend
    branch: main
    notify:
      slack: "#qa-reports"

  - name: "Desktop Weekly QA"
    cron: "0 3 * 0"         # 3 AM Sundays
    type: smoke
    repo: Comfy-Org/desktop
    branch: main
    notify:
      slack: "#qa-reports"
```

---

## 5. GitHub Comment Command

Users can trigger QA by commenting on an issue/PR:

```
/qa reproduce    — Reproduce the bug in this issue
/qa verify       — Verify this PR's changes
/qa smoke        — Run smoke tests on this PR
/qa demo         — Record a demo video
```

### Handler

```typescript
// gh-service/handlers/qa-comment.ts
export async function handleQAComment(event: IssueCommentEvent) {
  const match = event.comment.body.match(/^\/qa\s+(reproduce|verify|smoke|demo)$/);
  if (!match) return;

  // React with 👀 to acknowledge
  await gh.reactions.createForIssueComment({
    owner, repo, comment_id: event.comment.id,
    content: 'eyes',
  });

  // Run QA
  await qaOrchestrator.run({ ... });
}
```

---

## Trigger Priority & Rate Limiting

To prevent abuse and resource exhaustion:

- **Max concurrent QA runs**: 3 (configurable)
- **Rate limit per repo**: 5 runs per hour
- **Rate limit per user**: 3 runs per hour
- **Queue**: Excess tasks are queued with FIFO ordering
- **Timeout**: Each QA run has a 10-minute hard timeout
- **Deduplication**: Same issue + same commit = skip (use cached result)

```typescript
interface RateLimitConfig {
  maxConcurrent: number;        // 3
  perRepoPerHour: number;       // 5
  perUserPerHour: number;       // 3
  queueMaxSize: number;         // 20
  runTimeout: number;           // 600_000 (10 min)
  deduplicationWindow: number;  // 3600_000 (1 hour)
}
```

---

## Authentication & Authorization

- **Slack**: Only authorized channels (`#comfyprbot`, `#prbot`, `#qa-reports`)
- **GitHub**: Only repos under `Comfy-Org` organization
- **CLI**: Requires valid `GH_TOKEN` and repo access
- **Labels**: Only org members can add `qa:*` labels
