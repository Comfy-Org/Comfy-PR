# QA Bot — CLI Specification

## Command: `prbot qa`

New top-level command group in `bot/cli.ts` for all QA operations.

---

## Commands

### `prbot qa reproduce`

Reproduce a bug from a GitHub issue.

```bash
prbot qa reproduce --issue=<owner/repo#number> [options]
```

**Options:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--issue`, `-i` | string | required | GitHub issue reference (`owner/repo#123`) |
| `--branch` | string | issue's default branch | Branch to test on |
| `--backend` | string | `mock` | Backend strategy: `mock`, `real`, `replay` |
| `--video` | boolean | `true` | Record video |
| `--headed` | boolean | `true` | Use headed browser (for video quality) |
| `--post-github` | boolean | `true` | Post results to GitHub issue |
| `--post-slack` | string | — | Slack channel to post results |
| `--timeout` | number | `600` | Max run time in seconds |
| `--retries` | number | `2` | Max test retries for flaky detection |

**Example:**

```bash
prbot qa reproduce --issue=Comfy-Org/ComfyUI_frontend#10688
prbot qa reproduce -i Comfy-Org/ComfyUI_frontend#10688 --backend=real --timeout=300
```

---

### `prbot qa verify`

Verify a PR's changes with before/after comparison.

```bash
prbot qa verify --pr=<owner/repo#number> [options]
```

**Options:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--pr`, `-p` | string | required | GitHub PR reference (`owner/repo#123`) |
| `--base` | string | PR's base branch | Base branch for comparison |
| `--head` | string | PR's head branch | Head branch to verify |
| `--video` | boolean | `true` | Record before/after video |
| `--compare` | boolean | `true` | Record both base and head for comparison |
| `--post-github` | boolean | `true` | Post results to PR |
| `--post-slack` | string | — | Slack channel to post results |

**Example:**

```bash
prbot qa verify --pr=Comfy-Org/ComfyUI_frontend#9500
prbot qa verify -p Comfy-Org/ComfyUI_frontend#9500 --post-slack="#qa-reports"
```

---

### `prbot qa smoke`

Run smoke tests on a branch.

```bash
prbot qa smoke --repo=<owner/repo> [--branch=<branch>] [options]
```

**Options:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--repo`, `-r` | string | required | Repository (`owner/repo`) |
| `--branch`, `-b` | string | `main` | Branch to test |
| `--suite` | string | `default` | Test suite name (from `.qabot.yaml`) |
| `--video` | boolean | `true` | Record video |
| `--post-slack` | string | — | Slack channel for results |

**Example:**

```bash
prbot qa smoke --repo=Comfy-Org/ComfyUI_frontend
prbot qa smoke -r Comfy-Org/ComfyUI_frontend -b develop --post-slack="#qa-reports"
```

---

### `prbot qa demo`

Record a demo video of a feature.

```bash
prbot qa demo --repo=<owner/repo> --prompt="<what to demo>" [options]
```

**Options:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--repo`, `-r` | string | required | Repository (`owner/repo`) |
| `--branch`, `-b` | string | `main` | Branch with the feature |
| `--prompt` | string | required | Description of what to demo |
| `--duration` | number | `60` | Target video duration in seconds |
| `--post-slack` | string | — | Slack channel for results |
| `--post-github` | string | — | Issue/PR to post demo to |

**Example:**

```bash
prbot qa demo -r Comfy-Org/ComfyUI_frontend --prompt="Demo the template browser feature"
prbot qa demo -r Comfy-Org/ComfyUI_frontend -b feature/new-sidebar --prompt="Show sidebar navigation" --post-slack="#frontend"
```

---

### `prbot qa run`

Free-form QA task with custom prompt.

```bash
prbot qa run --repo=<owner/repo> --prompt="<task>" [options]
```

**Options:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--repo`, `-r` | string | required | Repository (`owner/repo`) |
| `--branch`, `-b` | string | `main` | Branch to test |
| `--prompt` | string | required | Free-form QA task description |
| `--video` | boolean | `true` | Record video |
| `--post-slack` | string | — | Slack channel |
| `--post-github` | string | — | Issue/PR number |

**Example:**

```bash
prbot qa run -r Comfy-Org/ComfyUI_frontend --prompt="Check if drag and drop works on the canvas"
```

---

### `prbot qa list`

List recent QA runs.

```bash
prbot qa list [--repo=<owner/repo>] [--limit=<n>] [--status=<status>]
```

**Example:**

```bash
prbot qa list --repo=Comfy-Org/ComfyUI_frontend --limit=10
prbot qa list --status=REPRODUCED
```

---

### `prbot qa artifacts`

Get artifacts from a specific QA run.

```bash
prbot qa artifacts <run-id> [--download] [--output=<dir>]
```

**Example:**

```bash
prbot qa artifacts abc-123-def --download --output=./qa-results/
```

---

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | QA run completed successfully |
| 1 | QA run failed (error) |
| 2 | Invalid arguments |
| 3 | Timeout exceeded |
| 4 | App failed to start |
| 5 | Rate limit exceeded |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GH_TOKEN` | Yes | GitHub token for repo access |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI agent |
| `SLACK_BOT_TOKEN` | For Slack posting | Slack bot token |
| `GCS_BUCKET` | For artifact upload | GCS bucket name |
| `GCS_SERVICE_ACCOUNT` | For artifact upload | GCS service account JSON |
| `OPENAI_API_KEY` | Optional | For vision-based navigation |

---

## Integration with `bot/cli.ts`

```typescript
// bot/cli.ts — add qa command group
.command('qa', 'Automated QA testing', (yargs) =>
  yargs
    .command('reproduce', 'Reproduce a bug from a GitHub issue', ...)
    .command('verify', 'Verify a PR with before/after comparison', ...)
    .command('smoke', 'Run smoke tests on a branch', ...)
    .command('demo', 'Record a demo video', ...)
    .command('run', 'Free-form QA task', ...)
    .command('list', 'List recent QA runs', ...)
    .command('artifacts', 'Get artifacts from a QA run', ...)
    .demandCommand(1, 'Please specify a QA sub-command')
)
```
