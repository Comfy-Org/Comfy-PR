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

### Available Skills

The bot agent prompt (lines 390-396 in `bot/index.ts`) includes the following skills:

1. **Web Search**
   - Search the web for relevant information
   - Gather up-to-date information and context

2. **GitHub Repository Access**
   - Clone any repositories from https://github.com/Comfy-Org
   - Inspect codebases at `./codes/Comfy-Org/[repo]/tree/[branch]`
   - Read and analyze source code

3. **Slack Integration**
   - **Update messages**: `bun ../bot/slack/msg-update.ts --channel ${event.channel} --ts ${quickRespondMsg.ts} --text "<response>"`
   - **Read threads**: `bun ../bot/slack/msg-read-thread.ts --channel ${event.channel} --ts [ts]`
   - Update responses frequently to provide live progress updates

4. **Notion Documentation Search**
   - Search Notion docs from Comfy-Org team: `./bot/notion-search.ts`
   - Access internal documentation and knowledge base

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

## SFlow Stream Processing Library

### Overview

SFlow is a powerful functional stream processing library used throughout the codebase for handling asynchronous data operations. It provides a rich set of utilities for transforming streams with a functional programming approach, similar to RxJS but optimized for modern JavaScript/TypeScript and WebStreams.

### Implementation Details

- **Package**: `sflow@1.24.0`
- **Author**: snomiao
- **License**: MIT
- **Core Concepts**: SFlow is built around composable stream operators, lazy evaluation, and support for both synchronous and asynchronous data flows.
