# Claude Development Notes

## TypeScript Performance Optimization (2026-01-10)

### Problem

The TypeScript server was experiencing severe performance issues causing slowdowns and crashes.

### Root Causes

1. **Overly broad include pattern** (`**/*.ts`) - forced scanning of 15,355+ .d.ts files in node_modules
2. **Expensive recursive type** (`DeepAsyncWrapper<T>`) - computed over 122K+ line Octokit type definitions
3. **Test files included** - unnecessary type checking during development

### Solution (PR #139)

- Replaced `**/*.ts` with specific directory patterns in tsconfig.json
- Removed `DeepAsyncWrapper` type from src/ghc.ts (runtime proxy handles async wrapping)
- Excluded `**/*.spec.ts` and `**/*.test.ts` from compilation
- TypeScript compilation now completes in ~33s with clean builds

### Key Files Modified

- `tsconfig.json`: Specific includes instead of broad patterns
- `src/ghc.ts`: Simplified type annotation for `ghc` export
- `next-env.d.ts`: Created (auto-generated, git-ignored)

## General Development Flow for All Scripts

### Standard Development Pattern

1. **Install Dependencies**: Use `bun add <package>` for runtime deps, `bun add -d <package>` for dev deps
2. **Create Implementation**: Write the main functionality in TypeScript
3. **Add Testing**: Create `.spec.ts` files with comprehensive test coverage
4. **Test Execution**: Use `bun <file.ts>` to run scripts directly with `if (import.meta.main)` blocks
5. **Type Safety**: Ensure full TypeScript coverage and proper type definitions
6. **Error Handling**: Handle errors gracefully and don't cache failed responses
7. **Documentation**: Update CLAUDE.md with implementation details and usage examples

### Testing Standards

- **File Naming**: Use `.spec.ts` suffix for test files
- **Mocking**: Mock external APIs and services to avoid real calls during tests
- **Coverage Areas**: Test happy path, error cases, edge cases, concurrent scenarios
- **Setup/Teardown**: Clean up resources (files, caches, etc.) in test lifecycle hooks

### Common Patterns

- **Caching**: Use Keyv with SQLite for persistent caching in `node_modules/.cache/Comfy-PR/`
- **Configuration**: Store config in environment variables with sensible defaults
- **Logging**: Use console.log sparingly, prefer structured logging for debugging
- **File Organization**: Keep related functionality together, use clear module exports

### Repository Structure

- **`src/`**: Core utilities and shared functionality
- **`app/tasks/`**: Specific task implementations
- **`bot/github/`**: GitHub integration tools including pr-bot for spawning AI agents on repositories
- **`gh-service/`**: GitHub webhook service components
- **`run/`**: Executable scripts and services
- **Tests**: Co-located with source files using `.spec.ts` suffix

## Cached GitHub Client (ghc)

### Overview

Created a cached wrapper around the GitHub API client that transparently caches all API responses to improve performance and reduce API rate limiting.

### Implementation

- **File**: `src/ghc.ts`
- **Cache Storage**: SQLite via Keyv in `node_modules/.cache/Comfy-PR/gh-cache.sqlite`
- **Default TTL**: 5 minutes
- **Cache Key Format**: `gh.{apiPath}({truncatedArgs})#{hash}`

### Key Features

1. **Transparent Caching**: Same interface as `gh` object, just import `ghc` instead
2. **Smart Cache Keys**: Truncates long arguments but preserves full hash for accuracy
3. **SQLite Storage**: Persistent cache across runs
4. **Type Safety**: Maintains full TypeScript types from original GitHub client

### Usage

```typescript
import { ghc } from "./src/ghc";

// Same as gh.repos.get() but with caching
const repo = await ghc.repos.get({
  owner: "octocat",
  repo: "Hello-World",
});

// Second call uses cache
const cachedRepo = await ghc.repos.get({
  owner: "octocat",
  repo: "Hello-World",
});
```

### Cache Management

```typescript
import { clearGhCache, getGhCacheStats } from "./src/ghc";

// Clear all cached data
await clearGhCache();

// Get cache statistics
const stats = await getGhCacheStats();
```

### Testing

- **Test File**: `src/ghc.spec.ts`
- **Coverage**: Cache hits/misses, error handling, concurrent requests, key generation
- **Mocking**: Uses Jest mocks to avoid real API calls during tests

### Development Flow

1. Install dependencies: `bun add keyv @keyv/sqlite`
2. Create cached wrapper with Proxy pattern
3. Implement cache key generation with argument truncation
4. Add comprehensive test suite
5. Test with real API calls: `bun src/ghc.ts`

### Cache Key Examples

- Short args: `gh.repos.get({"owner":"octocat","repo":"Hello-World"})#b3117af2`
- Long args: `gh.repos.get({"owner":"octocat","descripti...bbbbbbbbbb"})#4240f076`

## ComfyPR Bot Skills

### Overview

The ComfyPR Bot (defined in `bot/index.ts`) is a Slack-integrated AI assistant that helps with research, documentation, and code investigation tasks. When spawned, the bot agent has access to several specialized skills.

### Architecture: Master-Worker Pattern

The bot system uses a two-tier architecture:

1. **Master Agent (ComfyPR Bot)** - Research and Coordination
   - Handles Slack interactions and user communication
   - Performs research, documentation searches, and code analysis (READ-ONLY)
   - Coordinates work by spawning specialized sub-agents
   - **CANNOT make direct code changes to GitHub repositories**
   - Must delegate all coding tasks to PR-Bot sub-agents

2. **Worker Agents (PR-Bot Sub-Agents)** - Code Modification
   - Spawned by master agent via `bun bot/github/pr-bot.ts`
   - Clones repositories to isolated directories (`/repos/`)
   - Has full write access to make code changes
   - Creates commits, branches, and pull requests
   - Works independently in isolated environment

This separation ensures:
- Clear separation of concerns (research vs. execution)
- Better isolation and safety for code modifications
- Ability to spawn multiple coding agents in parallel
- Master agent stays focused on coordination and communication

### Available Skills

The bot agent prompt (lines 390-396 in `bot/index.ts`) includes the following skills:

1. **Web Search**
   - Search the web for relevant information
   - Gather up-to-date information and context

2. **GitHub Repository Access (READ-ONLY)**
   - Clone any repositories from https://github.com/Comfy-Org
   - Inspect codebases at `./codes/Comfy-Org/[repo]/tree/[branch]`
   - Read and analyze source code
   - **Note**: Master bot CANNOT make direct code changes - must use pr-bot tool

3. **Slack Integration**
   - **Update messages**: `bun ../bot/slack/msg-update.ts --channel ${event.channel} --ts ${quickRespondMsg.ts} --text "<response>"`
   - **Read threads**: `bun ../bot/slack/msg-read-thread.ts --channel ${event.channel} --ts [ts]`
   - Update responses frequently to provide live progress updates

4. **Notion Documentation Search**
   - Search Notion docs from Comfy-Org team: `./bot/notion/search.ts`
   - Access internal documentation and knowledge base

5. **Code Modification via PR-Bot (REQUIRED for GitHub changes)**
   - To make any code changes to GitHub repositories, use: `bun ../bot/github/pr-bot.ts --repo=<owner/repo> [--branch=<branch>] --prompt="<detailed coding task>"`
   - Master bot is a RESEARCH and COORDINATION agent only
   - All actual coding work must be delegated to pr-bot sub-agents
   - Master bot CANNOT create commits, branches, or PRs directly

### Context Repositories

The bot has knowledge of these Comfy-Org repositories:

- **comfyanonymous/ComfyUI**: Main ComfyUI repository (Python ML backend)
- **Comfy-Org/ComfyUI_frontend**: Frontend codebase (Vue + TypeScript)
- **Comfy-Org/docs**: Documentation, setup guides, tutorials, API references
- **Comfy-Org/desktop**: Desktop application
- **Comfy-Org/registry**: registry.comfy.org for custom-nodes and extensions
- **Comfy-Org/workflow_templates**: Official shared workflow templates

### Usage

The bot is automatically spawned when:

1. A user mentions the bot in a Slack channel
2. The message is in an authorized channel (`#comfypr-bot` or `#pr-bot`)
3. The bot determines that agent assistance is needed

See `bot/README.md` for documentation on the individual skill scripts.

## Coding Sub-Agent

### Overview

The coding sub-agent system (`bot/github/coding/`) allows you to spawn AI coding agents that work on specific GitHub repositories. The agent automatically clones repositories, checks out branches, and runs in an interactive coding session.

### Implementation

- **Main Script**: `bot/github/pr-bot.ts`
- **Core Logic**: `bot/github/coding/pr-agent.ts`
- **Tests**: `bot/github/coding/pr-agent.spec.ts`
- **Repository Storage**: `/repos/[owner]/[repo]/tree/[branch]/`

### Usage

```bash
bun bot/github/pr-bot.ts --repo=<owner/repo> [--branch=<branch>] --prompt="<your prompt>"
```

**Arguments:**
- `--repo` (required): GitHub repository in format `owner/repo`
- `--branch` (optional): Branch to work on (defaults to `main`)
- `--prompt` (required): The coding task for the agent

**Examples:**
```bash
# Fix a bug in ComfyUI
bun bot/github/pr-bot.ts --repo=Comfy-Org/ComfyUI --prompt="Fix authentication bug in login module"

# Add a feature to the frontend
bun bot/github/pr-bot.ts --repo=Comfy-Org/ComfyUI_frontend --branch=develop --prompt="Add dark mode support"
```

### How It Works

1. **Auto-Clone**: Clones the repository to `/repos/[owner]/[repo]/tree/[branch]/` if not already present
2. **Update**: If repository exists, pulls latest changes from the specified branch
3. **Spawn Agent**: Launches `claude-yes` agent in the repository directory with the specified prompt
4. **Interactive Session**: Agent has full access to read, edit, and create files in the repository

### Key Features

1. **Automatic Repository Management**: No manual cloning needed
2. **Branch Isolation**: Each branch is stored separately in its own directory
3. **Reusable Sessions**: Existing clones are reused and updated
4. **Clean Separation**: Cloned repos stored in `/repos/` (absolute system path)

### Development Flow

1. Install dependencies: Already included in main `package.json`
2. Created implementation with CLI arg parsing using `minimist`
3. Implemented auto-clone logic with Bun shell `$` wrapper
4. Added comprehensive test suite with Bun test
5. Documentation in `bot/github/coding/README.md`

## SFlow Stream Processing Library

### Overview

SFlow is a powerful functional stream processing library used throughout the codebase for handling asynchronous data operations. It provides a rich set of utilities for transforming streams with a functional programming approach, similar to RxJS but optimized for modern JavaScript/TypeScript and WebStreams.

### Implementation Details

- **Package**: `sflow@1.24.0`
- **Author**: snomiao
- **License**: MIT
- **Core Concepts**: SFlow is built around composable stream operators, lazy evaluation, and support for both synchronous and asynchronous data flows.

## Project TODOs

### How to Find TODOs

To search for all TODO comments across the project:

```bash
# Search for TODO comments using pr-bot
pr-bot code search -q "TODO"

# Or use grep locally
grep -ri "TODO" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.go" .
```

### Priority TODOs (This Project)

**Bot Implementation (`bot/index.ts`)**
- Line 145: Define `zSlackMessage` schema
- Line 527: Create a Linux user for task isolation
- Line 660: Spawn tasks in a worker user for security
- Line 755: Implement periodic screen + TODO.md + REPORT.md checking (every 10s) with Slack updates

**Registry Search (`bot/registry/search.ts`)** ✅ COMPLETED
- ~~Line 1: Call api.comfy.org to search custom nodes~~ - Implemented in `searchRegistryNodes()` function

**GitHub Action Updates**
- `src/GithubActionUpdateTask/updateGithubActionPrepareBranch.ts:96`: GPT review implementation
- `src/createGithubPullRequest.ts:80`: Implement lock mechanism with repo+branch
- `src/createGithubPullRequest.ts:103`: Fix head_repo bugs

**Performance Optimizations**
- `src/CNRepos.ts:28,39`: Refactor into interface to improve performance
- `src/analyzeTotals.ts:19`: Split heavy function into smaller chunks
- `src/updateFollowRuleSet.ts:67`: Enhance performance
- `packages/mongodb-pipeline-ts/$flatten.ts:31`: Optimize implementation

**Tasks**
- `app/tasks/gh-priority-sync/index.ts:452`: Fix sorting by updatedAt when combining results
- `app/tasks/gh-design/gh-design.ts:59`: Find way to record approved state
- `app/tasks/coreping/coreping.ts:360`: Update message with delete line when reviewed
- `app/tasks/github-contributor-analyze/GithubContributorAnalyzeTask.ts:21`: Rename GithubContributorAnalzyeTask => GithubContributorAnalyzeTask (typo fix)

**Type Safety**
- `packages/mongodb-pipeline-ts/$pipeline.ts:163,166`: Fix replaceRoot/replaceWith types

**Deprecations**
- `src/CNRepos.ts:65,72`: Remove deprecated methods
- `src/CRPulls.ts:5`: Utilize CRPulls collection (@sno)
- `src/updateAuthorsFromCNRepo.ts:18`: Get totals open/closed/merged

**Configuration**
- `docker-compose.yml:47`: Use .override.yml to enable testing dmongodb
- `app/api/auth/[...nextauth]/getAuthUser.tsx:10`: Move auth config to .env file

### External Project TODOs (Reference Only)

**comfy-api** (codes/Comfy-Org/comfy-api/)
- Multiple proxy endpoints need user filtering implementation (7 occurrences)
- Service account setup for dev environment
- Machine image creation logic conflicts between dreamboothy-dev and dreamboothy
- Kling video retention policy implementation
- GIN index on preempted_comfy_node_names for performance
- Metric export to NewRelic instead of GCP (2 occurrences)
- Billing verification tests for Moonvalley, Kling, Tripo
- OpenAPI schema validation fixes (multiple required fields)

### TODO Resolution Workflow

When working on TODOs:

1. **Search**: Use `pr-bot code search -q "TODO"` or `grep -ri "TODO"`
2. **Prioritize**: Focus on TODOs in active development areas first
3. **Context**: Read surrounding code to understand the TODO context
4. **Implement**: Create a branch and implement the solution
5. **Test**: Add tests for the new implementation
6. **Remove**: Delete the TODO comment once resolved
7. **Document**: Update CLAUDE.md if the change affects development patterns

### Creating TODOs

When adding new TODOs, use this format:

```typescript
// TODO: <description of what needs to be done>
// TODO(@username): <description> - for specific person assignments
// TODO(priority): <description> - for urgent items
```

### Auto-Solving TODOs with pr-bot

You can use pr-bot to automatically work on TODOs:

```bash
# Search for specific TODO
pr-bot code search -q "TODO performance"

# Create a PR to fix a TODO
pr-bot code pr -r Comfy-Org/Comfy-PR -p "Fix TODO in bot/index.ts line 145: Define zSlackMessage schema"
```
