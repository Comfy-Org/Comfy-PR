# Dependency Bloat Analysis

**Severity: 🟡 Medium**

## Problem

The project has **127 production dependencies** and **22 dev dependencies**. Many are heavy, redundant, or unused in the web application context. This impacts:

- **Cold start time** on Vercel serverless functions
- **Build time** (more to resolve, transform, bundle)
- **Bundle size** (tree-shaking isn't perfect)
- **Security surface** (more packages = more potential vulnerabilities)

## Heavy Dependencies

### Tier 1: Very Heavy (>1 MB each)

| Package         | Approx Size | Used In                     | Issue                                                                             |
| --------------- | ----------- | --------------------------- | --------------------------------------------------------------------------------- |
| `monaco-editor` | ~4 MB       | `components/CodeEditor.tsx` | Full editor shipped to client; `@monaco-editor/react` already lazy-loads from CDN |
| `googleapis`    | ~3 MB       | Google OAuth                | Massive package for likely just auth; use `google-auth-library` alone             |
| `octokit`       | ~2 MB       | GitHub API                  | Meta-package; use specific `@octokit/rest` instead                                |
| `openai`        | ~1.5 MB     | AI features                 | Needed, but ensure it's only in server bundles                                    |
| `zx`            | ~1 MB       | Shell scripting             | Only used in scripts; shouldn't be in production dependencies                     |

### Tier 2: Medium-Heavy (200 KB - 1 MB)

| Package       | Approx Size          | Issue                                                            |
| ------------- | -------------------- | ---------------------------------------------------------------- |
| `d3`          | ~500 KB              | Only `csvFormat`/`csvParse` used; replace with `d3-dsv` (~15 KB) |
| `react-icons` | ~400 KB per icon set | Only 2 icons used; replace with SVGs or `lucide-react`           |
| `faker`       | ~800 KB              | Listed in production deps — should be devDependencies or removed |
| `prettier`    | ~2 MB                | Listed in production deps — should be devDependencies only       |
| `vercel`      | ~50 MB+              | Listed in production deps — the CLI should be devDependencies    |

## Redundant / Duplicate Dependencies

| Group            | Packages                                                                                                                                                    | Issue                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Shell execution  | `execa`, `zx`, Bun `$`                                                                                                                                      | Three ways to run shell commands; standardize on Bun `$` |
| YAML             | `yaml`, `js-yaml`                                                                                                                                           | Two YAML libraries; use just `yaml` (already primary)    |
| Data utilities   | `rambda`, `lodash-es`                                                                                                                                       | Two functional utility libraries                         |
| Diffing          | `react-diff-view`, `react-diff-viewer`, `fast-diff`, `git-diff`                                                                                             | 4 diff-related packages                                  |
| Markdown         | `react-markdown`, `markdown-it`                                                                                                                             | Two markdown renderers                                   |
| Hashing          | `md5`, `sha256`                                                                                                                                             | Two hash libraries; use Node.js built-in `crypto`        |
| Key-value stores | `keyv`, `@keyv/sqlite`, `@keyv/mongo`, `keyv-cache-proxy`, `keyv-cached-with`, `keyv-mongodb-store`, `keyv-nedb-store`, `keyv-nest`, `@snomiao/keyv-sqlite` | 9 keyv-related packages                                  |

## Misplaced Dependencies

These are in `dependencies` but should be in `devDependencies`:

| Package    | Reason                                  |
| ---------- | --------------------------------------- |
| `faker`    | Test data generation only               |
| `prettier` | Code formatting tool                    |
| `vercel`   | Deployment CLI                          |
| `zx`       | Script runner                           |
| `bun`      | Runtime (should be implicit)            |
| `@types/*` | Type definitions (some in dependencies) |

## Impact on Vercel Cold Starts

Vercel serverless functions package all `node_modules` in production dependencies. With `output: "standalone"`, Next.js traces only needed files, but:

- Heavy packages like `googleapis`, `monaco-editor`, `faker` may still be traced if imported transitively.
- The `NODE_OPTIONS: "--max-old-space-size=4096"` in `vercel.json` suggests the build is already memory-constrained.

## Recommendations

### Quick Wins (Low Effort, High Impact)

1. Move `faker`, `prettier`, `vercel`, `zx`, `bun` to `devDependencies`
2. Replace `import * as d3 from "d3"` with `import { csvFormat } from "d3-dsv"`
3. Remove `monaco-editor` from dependencies (let `@monaco-editor/react` use CDN)
4. Replace `react-icons` usage with `lucide-react` (already installed)

### Medium Effort

5. Replace `googleapis` with just `google-auth-library` if only OAuth is used
6. Consolidate to one YAML library (`yaml`)
7. Consolidate to one diff library
8. Replace `md5`/`sha256` with Node.js `crypto`

### Tracking Metric

Run periodically:

```bash
# Count production deps
jq '.dependencies | length' package.json
# Currently: 127 — Target: <80
```
