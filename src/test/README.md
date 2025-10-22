# Testing Infrastructure with MSW

This directory contains the Mock Service Worker (MSW) setup for testing GitHub API interactions in the Comfy-PR project.

## Overview

MSW intercepts HTTP requests at the network level, providing realistic mocking for GitHub API calls. This approach:

- **More realistic**: Mocks actual network requests rather than module implementations
- **Type-safe**: Works seamlessly with the GitHub Octokit client
- **Maintainable**: Centralized mock handlers for all GitHub API endpoints
- **Flexible**: Easy to override handlers for specific test cases

## Files

### `msw-setup.ts`

Configures the MSW server for Bun test runner:

```typescript
import { setupServer } from "msw/node";
import { githubHandlers } from "./github-handlers";

export const server = setupServer(...githubHandlers);
```

The server is automatically:

- Started before all tests
- Reset after each test
- Closed after all tests complete

### `github-handlers.ts`

Contains all GitHub API mock handlers used in the project. Organized by API category:

#### Repos API

- `GET /repos/:owner/:repo` - Get a repository
- `POST /repos/:owner/:repo/forks` - Create a fork
- `GET /repos/:owner/:repo/branches/:branch` - Get a branch
- `GET /repos/:owner/:repo/tags` - List tags
- `GET /repos/:owner/:repo/commits/:ref` - Get a commit
- `GET /repos/:owner/:repo/releases` - List releases
- `GET /repos/:owner/:repo/hooks` - List webhooks
- `POST /repos/:owner/:repo/hooks` - Create a webhook

#### Pulls API

- `GET /repos/:owner/:repo/pulls` - List pull requests
- `GET /repos/:owner/:repo/pulls/:pull_number` - Get a pull request
- `POST /repos/:owner/:repo/pulls` - Create a pull request
- `PATCH /repos/:owner/:repo/pulls/:pull_number` - Update a pull request
- `POST /repos/:owner/:repo/pulls/:pull_number/requested_reviewers` - Request reviewers
- `GET /repos/:owner/:repo/pulls/:pull_number/comments` - List review comments

#### Issues API

- `GET /repos/:owner/:repo/issues` - List issues
- `GET /repos/:owner/:repo/issues/:issue_number` - Get an issue
- `PATCH /repos/:owner/:repo/issues/:issue_number` - Update an issue
- `GET /repos/:owner/:repo/issues/:issue_number/comments` - List comments
- `POST /repos/:owner/:repo/issues/:issue_number/comments` - Create a comment
- `PATCH /repos/:owner/:repo/issues/comments/:comment_id` - Update a comment
- `GET /repos/:owner/:repo/issues/comments/:comment_id` - Get a comment
- `POST /repos/:owner/:repo/issues/:issue_number/labels` - Add labels
- `GET /repos/:owner/:repo/issues/:issue_number/timeline` - List timeline events

#### Git API

- `GET /repos/:owner/:repo/git/tags/:tag_sha` - Get an annotated tag
- `DELETE /repos/:owner/:repo/git/refs/:ref` - Delete a reference

#### Users API

- `GET /user` - Get authenticated user
- `GET /users/:username` - Get a user by username

## Usage

### Basic Usage

The MSW setup is automatically loaded for all tests via `bunfig.toml`:

```toml
[test]
preload = ["./src/preload.ts", "./src/test/msw-setup.ts"]
```

Simply import and use the GitHub client in your tests:

```typescript
import { gh } from "@/src/gh";
import { describe, expect, it } from "bun:test";

describe("My Test", () => {
  it("should fetch a repo", async () => {
    const result = await gh.repos.get({
      owner: "octocat",
      repo: "Hello-World",
    });

    expect(result.data.name).toBe("Hello-World");
  });
});
```

### Overriding Handlers

You can override default handlers for specific test cases:

```typescript
import { server } from "@/src/test/msw-setup";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "bun:test";

describe("Error Handling", () => {
  it("should handle 404 errors", async () => {
    server.use(
      http.get("https://api.github.com/repos/:owner/:repo", () => {
        return new HttpResponse(null, { status: 404 });
      }),
    );

    try {
      await gh.repos.get({ owner: "nonexistent", repo: "nonexistent" });
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.status).toBe(404);
    }
  });
});
```

### Testing with Cache (ghc)

The cached GitHub client (`ghc`) works seamlessly with MSW:

```typescript
import { ghc, clearGhCache } from "@/src/ghc";
import { beforeEach, describe, expect, it } from "bun:test";

describe("Cached Client", () => {
  beforeEach(async () => {
    await clearGhCache(); // Clear cache before each test
  });

  it("should cache responses", async () => {
    const result1 = await ghc.repos.get({ owner: "octocat", repo: "Hello-World" });
    const result2 = await ghc.repos.get({ owner: "octocat", repo: "Hello-World" });

    // Second call uses cache - both return same data
    expect(result1.data).toEqual(result2.data);
  });
});
```

## Adding New Mock Handlers

When adding support for new GitHub API endpoints:

1. Add the handler to `github-handlers.ts`:

```typescript
// GET /repos/:owner/:repo/collaborators - List collaborators
http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/collaborators`, ({ params }) => {
  const { owner, repo } = params;
  return HttpResponse.json([
    {
      login: "collaborator1",
      id: 1,
      permissions: {
        admin: false,
        maintain: true,
        push: true,
        triage: true,
        pull: true,
      },
    },
  ]);
}),
```

2. Add tests in `gh.spec.ts` or your feature test file:

```typescript
it("should list collaborators", async () => {
  const result = await gh.repos.listCollaborators({
    owner: "octocat",
    repo: "Hello-World",
  });

  expect(result.data).toBeDefined();
  expect(Array.isArray(result.data)).toBe(true);
});
```

## Benefits

### 1. **No More Manual Mocking**

Before:

```typescript
jest.mock("@/src/gh");
const mockGh = gh as jest.Mocked<typeof gh>;
mockGh.repos = {
  get: jest.fn().mockResolvedValue({ data: { ... } }),
} as any;
```

After:

```typescript
// Just use gh directly - MSW handles the rest
const result = await gh.repos.get({ owner: "octocat", repo: "Hello-World" });
```

### 2. **Realistic Response Structures**

MSW handlers return complete, realistic GitHub API responses based on actual API documentation, ensuring tests catch type mismatches and missing fields.

### 3. **Shared Mock Data**

All tests use the same centralized mock handlers, ensuring consistency across the test suite.

### 4. **Easy Debugging**

MSW logs unhandled requests, making it easy to identify missing mock handlers:

```
[MSW] Warning: captured a request without a matching request handler:
  • GET https://api.github.com/repos/owner/repo/topics
```

## Migration Guide

### Migrating Existing Tests

For tests using `jest.mock("@/src/gh")`:

**Option 1: Remove jest.mock entirely (recommended)**

```typescript
// Remove this:
// jest.mock("@/src/gh");

// Remove manual mocking:
// mockGh.repos.get = jest.fn().mockResolvedValue(...)

// Tests now use MSW automatically
const result = await gh.repos.get({ owner: "test", repo: "test" });
```

**Option 2: Keep jest.mock for specific overrides**

```typescript
// Keep jest.mock for non-HTTP logic only
jest.mock("@/src/slack/channels");
jest.mock("@/src/db");

// GitHub API calls use MSW automatically
const result = await gh.repos.get({ owner: "test", repo: "test" });
```

## Troubleshooting

### Handler Not Found

If you see warnings about unhandled requests:

1. Check if the endpoint is in `github-handlers.ts`
2. Verify the URL path matches exactly (check for typos)
3. Add a new handler if needed

### Response Type Mismatch

If tests fail due to unexpected response structure:

1. Check the actual GitHub API documentation
2. Update the handler in `github-handlers.ts` to match
3. Run tests to verify

### Cache Issues

If cached client tests behave unexpectedly:

1. Ensure `clearGhCache()` is called in `beforeEach`
2. Check that cache is properly cleared between tests
3. Verify MSW handlers are being reset after each test

## Resources

- [MSW Documentation](https://mswjs.io/)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [Octokit REST.js Documentation](https://octokit.github.io/rest.js/)
