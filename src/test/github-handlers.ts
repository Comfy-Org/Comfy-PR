import { http, HttpResponse } from "msw";

const GITHUB_API_BASE = "https://api.github.com";

/**
 * MSW handlers for GitHub API endpoints
 * These handlers mock all GitHub API calls used throughout the Comfy-PR codebase
 */
export const githubHandlers = [
  // ==================== REPOS ====================

  // GET /repos/:owner/:repo - Get a repository
  // Use owner="error-404" to simulate 404, owner="rate-limited" to simulate 403 rate limit
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo`, ({ params }) => {
    const { owner, repo } = params;
    if (owner === "error-404")
      return HttpResponse.json(
        { message: "Not Found", documentation_url: "https://docs.github.com/rest" },
        { status: 404 },
      );
    if (owner === "rate-limited")
      return HttpResponse.json({ message: "API rate limit exceeded" }, { status: 403 });
    return HttpResponse.json({
      id: 123456,
      name: repo,
      full_name: `${owner}/${repo}`,
      owner: {
        login: owner,
        id: 1,
        type: "User",
      },
      html_url: `https://github.com/${owner}/${repo}`,
      description: "Test repository",
      fork: false,
      default_branch: "main",
      archived: false,
      disabled: false,
      private: false,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2025-01-15T00:00:00Z",
      pushed_at: "2025-01-15T00:00:00Z",
      size: 1000,
      stargazers_count: 10,
      watchers_count: 10,
      language: "TypeScript",
      has_issues: true,
      has_projects: true,
      has_downloads: true,
      has_wiki: true,
      has_pages: false,
      forks_count: 5,
      open_issues_count: 2,
      license: {
        key: "mit",
        name: "MIT License",
        spdx_id: "MIT",
        url: "https://api.github.com/licenses/mit",
      },
    });
  }),

  // POST /repos/:owner/:repo/forks - Create a fork
  http.post(`${GITHUB_API_BASE}/repos/:owner/:repo/forks`, async ({ params, request }) => {
    const { owner, repo } = params;
    const body = (await request.json()) as Record<string, unknown>;
    const forkName = body?.name || `${repo}-fork`;
    const forkOwner = body?.organization || "test-user";

    return HttpResponse.json({
      id: 789012,
      name: forkName,
      full_name: `${forkOwner}/${forkName}`,
      owner: {
        login: forkOwner,
        id: 2,
        type: body?.organization ? "Organization" : "User",
      },
      html_url: `https://github.com/${forkOwner}/${forkName}`,
      description: "Forked repository",
      fork: true,
      default_branch: "main",
      parent: {
        full_name: `${owner}/${repo}`,
      },
      created_at: new Date().toISOString(),
    });
  }),

  // GET /repos/:owner/:repo/branches/:branch - Get a branch
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/branches/:branch`, ({ params }) => {
    const { owner, repo, branch } = params;
    return HttpResponse.json({
      name: branch,
      commit: {
        sha: "abc123def456",
        url: `https://api.github.com/repos/${owner}/${repo}/commits/abc123def456`,
      },
      protected: branch === "main",
    });
  }),

  // GET /repos/:owner/:repo/tags - List tags
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/tags`, ({ params }) => {
    const { owner, repo } = params;
    return HttpResponse.json([
      {
        name: "v0.2.1",
        commit: {
          sha: "abc123def456",
          url: `https://api.github.com/repos/${owner}/${repo}/commits/abc123def456`,
        },
        zipball_url: `https://api.github.com/repos/${owner}/${repo}/zipball/v0.2.1`,
        tarball_url: `https://api.github.com/repos/${owner}/${repo}/tarball/v0.2.1`,
        node_id: "REF_kwDOI_",
      },
      {
        name: "v0.2.0",
        commit: {
          sha: "def456ghi789",
          url: `https://api.github.com/repos/${owner}/${repo}/commits/def456ghi789`,
        },
        zipball_url: `https://api.github.com/repos/${owner}/${repo}/zipball/v0.2.0`,
        tarball_url: `https://api.github.com/repos/${owner}/${repo}/tarball/v0.2.0`,
        node_id: "REF_kwDOI_2",
      },
    ]);
  }),

  // GET /repos/:owner/:repo/commits/:ref - Get a commit
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/commits/:ref`, ({ params }) => {
    const { owner, repo, ref } = params;
    return HttpResponse.json({
      sha: ref,
      node_id: "C_kwDOI_",
      commit: {
        author: {
          name: "Test Author",
          email: "test@example.com",
          date: "2025-01-15T10:00:00Z",
        },
        committer: {
          name: "Test Committer",
          email: "test@example.com",
          date: "2025-01-15T10:00:00Z",
        },
        message: "Test commit message",
        tree: {
          sha: "tree123",
          url: `https://api.github.com/repos/${owner}/${repo}/git/trees/tree123`,
        },
      },
      html_url: `https://github.com/${owner}/${repo}/commit/${ref}`,
      author: {
        login: "test-author",
        id: 1,
      },
      committer: {
        login: "test-committer",
        id: 1,
      },
    });
  }),

  // GET /repos/:owner/:repo/releases - List releases
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/releases`, ({ params, request }) => {
    const { owner, repo } = params;
    const url = new URL(request.url);
    const perPage = parseInt(url.searchParams.get("per_page") || "30");

    const releases = [
      {
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        name: "v1.0.0",
        draft: false,
        prerelease: false,
        created_at: "2025-01-15T10:00:00Z",
        published_at: "2025-01-15T10:00:00Z",
        html_url: `https://github.com/${owner}/${repo}/releases/tag/v1.0.0`,
        body: "Release notes for v1.0.0",
        body_text: "Release notes for v1.0.0",
        author: {
          login: "test-author",
          id: 1,
        },
      },
      {
        id: 2,
        tag_name: "v0.9.0",
        target_commitish: "main",
        name: "v0.9.0",
        draft: false,
        prerelease: false,
        created_at: "2025-01-10T10:00:00Z",
        published_at: "2025-01-10T10:00:00Z",
        html_url: `https://github.com/${owner}/${repo}/releases/tag/v0.9.0`,
        body: "Release notes for v0.9.0",
        body_text: "Release notes for v0.9.0",
        author: {
          login: "test-author",
          id: 1,
        },
      },
    ];

    return HttpResponse.json(releases.slice(0, perPage));
  }),

  // GET /repos/:owner/:repo/hooks - List webhooks
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/hooks`, ({ params }) => {
    const { owner, repo } = params;
    return HttpResponse.json([
      {
        id: 1,
        url: `https://api.github.com/repos/${owner}/${repo}/hooks/1`,
        config: {
          url: "https://example.com/webhook",
          content_type: "json",
        },
        events: ["push", "pull_request"],
        active: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2025-01-15T00:00:00Z",
      },
    ]);
  }),

  // POST /repos/:owner/:repo/hooks - Create a webhook
  http.post(`${GITHUB_API_BASE}/repos/:owner/:repo/hooks`, async ({ params, request }) => {
    const { owner, repo } = params;
    const body = (await request.json()) as Record<string, unknown>;

    return HttpResponse.json({
      id: 2,
      url: `https://api.github.com/repos/${owner}/${repo}/hooks/2`,
      config: body.config,
      events: body.events,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  // ==================== PULLS ====================

  // GET /repos/:owner/:repo/pulls - List pull requests
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/pulls`, ({ params, request }) => {
    const { owner, repo } = params;
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "open";
    const head = url.searchParams.get("head");
    const base = url.searchParams.get("base") || "main";
    const perPage = parseInt(url.searchParams.get("per_page") || "30");
    const page = parseInt(url.searchParams.get("page") || "1");

    const pulls = [
      {
        id: 1,
        number: 101,
        state: "open",
        title: "Add new feature",
        body: "This PR adds a new feature",
        user: {
          login: "test-user",
          id: 1,
        },
        html_url: `https://github.com/${owner}/${repo}/pull/101`,
        created_at: "2025-01-10T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        closed_at: null,
        merged_at: null,
        head: {
          label: "test-user:feature-branch",
          ref: "feature-branch",
          sha: "abc123",
          repo: {
            full_name: "test-user/repo",
          },
        },
        base: {
          label: `${owner}:${base}`,
          ref: base,
          sha: "def456",
        },
        labels: [{ name: "enhancement" }],
        draft: false,
        comments: 2,
      },
      {
        id: 2,
        number: 100,
        state: "closed",
        title: "Fix bug",
        body: "This PR fixes a bug",
        user: {
          login: "test-user",
          id: 1,
        },
        html_url: `https://github.com/${owner}/${repo}/pull/100`,
        created_at: "2025-01-05T10:00:00Z",
        updated_at: "2025-01-08T10:00:00Z",
        closed_at: "2025-01-08T10:00:00Z",
        merged_at: "2025-01-08T10:00:00Z",
        head: {
          label: "test-user:bugfix-branch",
          ref: "bugfix-branch",
          sha: "ghi789",
          repo: {
            full_name: "test-user/repo",
          },
        },
        base: {
          label: `${owner}:${base}`,
          ref: base,
          sha: "def456",
        },
        labels: [{ name: "bug" }],
        draft: false,
        comments: 1,
      },
    ];

    let filtered = pulls;
    if (state !== "all") {
      filtered = pulls.filter((p) => p.state === state);
    }
    if (head) {
      filtered = filtered.filter((p) => p.head.label === head || p.head.label.endsWith(`:${head}`));
    }

    return HttpResponse.json(filtered.slice((page - 1) * perPage, page * perPage));
  }),

  // GET /repos/:owner/:repo/pulls/:pull_number - Get a pull request
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/pulls/:pull_number`, ({ params }) => {
    const { owner, repo, pull_number } = params;
    const prNumber = typeof pull_number === "string" ? parseInt(pull_number) : pull_number;
    return HttpResponse.json({
      id: 1,
      number: prNumber,
      state: "open",
      title: "Test Pull Request",
      body: "This is a test pull request body",
      user: {
        login: "test-user",
        id: 1,
      },
      html_url: `https://github.com/${owner}/${repo}/pull/${pull_number}`,
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      merged_at: null,
      head: {
        label: "test-user:feature-branch",
        ref: "feature-branch",
        sha: "abc123",
        repo: {
          full_name: "test-user/repo",
        },
      },
      base: {
        label: `${owner}:main`,
        ref: "main",
        sha: "def456",
      },
      labels: [],
      draft: false,
      comments: 0,
      maintainer_can_modify: true,
    });
  }),

  // POST /repos/:owner/:repo/pulls - Create a pull request
  http.post(`${GITHUB_API_BASE}/repos/:owner/:repo/pulls`, async ({ params, request }) => {
    const { owner, repo } = params;
    const body = (await request.json()) as Record<string, unknown>;

    return HttpResponse.json({
      id: 999,
      number: 999,
      state: "open",
      title: body.title,
      body: body.body,
      user: {
        login: "test-user",
        id: 1,
      },
      html_url: `https://github.com/${owner}/${repo}/pull/999`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      closed_at: null,
      merged_at: null,
      head: {
        label: body.head as string,
        ref: (body.head as string).split(":")[1] || (body.head as string),
        sha: "new123",
      },
      base: {
        label: `${owner}:${body.base}`,
        ref: body.base,
        sha: "base456",
      },
      labels: [],
      draft: false,
      maintainer_can_modify: body.maintainer_can_modify || false,
    });
  }),

  // PATCH /repos/:owner/:repo/pulls/:pull_number - Update a pull request
  http.patch(
    `${GITHUB_API_BASE}/repos/:owner/:repo/pulls/:pull_number`,
    async ({ params, request }) => {
      const { owner, repo, pull_number } = params;
      const body = (await request.json()) as Record<string, unknown>;

      return HttpResponse.json({
        id: 1,
        number: pull_number,
        state: body.state || "open",
        title: body.title || "Updated Pull Request",
        body: body.body || "Updated body",
        user: {
          login: "test-user",
          id: 1,
        },
        html_url: `https://github.com/${owner}/${repo}/pull/${pull_number}`,
        updated_at: new Date().toISOString(),
      });
    },
  ),

  // POST /repos/:owner/:repo/pulls/:pull_number/requested_reviewers - Request reviewers
  http.post(
    `${GITHUB_API_BASE}/repos/:owner/:repo/pulls/:pull_number/requested_reviewers`,
    async ({ params, request }) => {
const { owner: _owner, repo: _repo, pull_number } = params;
      const body = (await request.json()) as Record<string, unknown>;

      return HttpResponse.json({
        number: pull_number,
        requested_reviewers: (body.reviewers as string[] | undefined)?.map((login: string) => ({
          login,
          id: 1,
        })),
      });
    },
  ),

  // GET /repos/:owner/:repo/pulls/:pull_number/comments - List review comments
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/pulls/:pull_number/comments`, ({ params }) => {
    const { owner, repo, pull_number } = params;
    return HttpResponse.json([
      {
        id: 1,
        body: "Test review comment",
        user: {
          login: "test-reviewer",
          id: 2,
        },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        html_url: `https://github.com/${owner}/${repo}/pull/${pull_number}#discussion_r1`,
        path: "src/file.ts",
        position: 10,
        line: 15,
      },
    ]);
  }),

  // ==================== ISSUES ====================

  // GET /repos/:owner/:repo/issues - List issues
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/issues`, ({ params, request }) => {
    const { owner, repo } = params;
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "open";
    const labels = url.searchParams.get("labels");
    const perPage = parseInt(url.searchParams.get("per_page") || "30");
    const page = parseInt(url.searchParams.get("page") || "1");

    const issues = [
      {
        id: 1,
        number: 50,
        state: "open",
        title: "Bug in feature X",
        body: "Description of the bug",
        user: {
          login: "test-user",
          id: 1,
        },
        html_url: `https://github.com/${owner}/${repo}/issues/50`,
        created_at: "2025-01-10T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        closed_at: null,
        labels: [
          {
            name: "bug",
            color: "d73a4a",
          },
        ],
        comments: 3,
      },
      {
        id: 2,
        number: 49,
        state: "open",
        title: "Feature request: Add dark mode",
        body: "Please add dark mode support",
        user: {
          login: "test-user",
          id: 1,
        },
        html_url: `https://github.com/${owner}/${repo}/issues/49`,
        created_at: "2025-01-08T10:00:00Z",
        updated_at: "2025-01-12T10:00:00Z",
        closed_at: null,
        labels: [
          {
            name: "enhancement",
            color: "a2eeef",
          },
          {
            name: "Design",
            color: "1d76db",
          },
        ],
        comments: 5,
      },
      {
        id: 3,
        number: 48,
        state: "closed",
        title: "Fixed issue",
        body: "This issue was fixed",
        user: {
          login: "test-user",
          id: 1,
        },
        html_url: `https://github.com/${owner}/${repo}/issues/48`,
        created_at: "2025-01-05T10:00:00Z",
        updated_at: "2025-01-06T10:00:00Z",
        closed_at: "2025-01-06T10:00:00Z",
        labels: [],
        comments: 1,
      },
    ];

    let filtered = issues;
    if (state !== "all") {
      filtered = issues.filter((i) => i.state === state);
    }
    if (labels) {
      const labelList = labels.split(",");
      filtered = filtered.filter((i) => i.labels.some((l) => labelList.includes(l.name)));
    }

    return HttpResponse.json(filtered.slice((page - 1) * perPage, page * perPage));
  }),

  // GET /repos/:owner/:repo/issues/:issue_number - Get an issue
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/issues/:issue_number`, ({ params }) => {
    const { owner, repo, issue_number } = params;
    const issueNumber = typeof issue_number === "string" ? parseInt(issue_number) : issue_number;
    return HttpResponse.json({
      id: 1,
      number: issueNumber,
      state: "open",
      title: "Test Issue",
      body: "This is a test issue body",
      user: {
        login: "test-user",
        id: 1,
      },
      html_url: `https://github.com/${owner}/${repo}/issues/${issue_number}`,
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      closed_at: null,
      labels: [],
      comments: 0,
    });
  }),

  // PATCH /repos/:owner/:repo/issues/:issue_number - Update an issue
  http.patch(
    `${GITHUB_API_BASE}/repos/:owner/:repo/issues/:issue_number`,
    async ({ params, request }) => {
      const { owner, repo, issue_number } = params;
      const body = (await request.json()) as Record<string, unknown>;

      return HttpResponse.json({
        id: 1,
        number: issue_number,
        state: body.state || "open",
        title: body.title || "Updated Issue",
        body: body.body || "Updated body",
        user: {
          login: "test-user",
          id: 1,
        },
        html_url: `https://github.com/${owner}/${repo}/issues/${issue_number}`,
        updated_at: new Date().toISOString(),
      });
    },
  ),

  // GET /repos/:owner/:repo/issues/:issue_number/comments - List issue comments
  http.get(
    `${GITHUB_API_BASE}/repos/:owner/:repo/issues/:issue_number/comments`,
    ({ params, request }) => {
      const { owner, repo, issue_number } = params;
      const url = new URL(request.url);
      const direction = url.searchParams.get("direction") || "asc";

      const comments = [
        {
          id: 1,
          body: "First comment",
          user: {
            login: "test-user",
            id: 1,
          },
          created_at: "2025-01-10T10:00:00Z",
          updated_at: "2025-01-10T10:00:00Z",
          html_url: `https://github.com/${owner}/${repo}/issues/${issue_number}#issuecomment-1`,
        },
        {
          id: 2,
          body: "Second comment",
          user: {
            login: "test-user-2",
            id: 2,
          },
          created_at: "2025-01-11T10:00:00Z",
          updated_at: "2025-01-11T10:00:00Z",
          html_url: `https://github.com/${owner}/${repo}/issues/${issue_number}#issuecomment-2`,
        },
      ];

      return HttpResponse.json(direction === "desc" ? comments.reverse() : comments);
    },
  ),

  // POST /repos/:owner/:repo/issues - Create an issue
  http.post(`${GITHUB_API_BASE}/repos/:owner/:repo/issues`, async ({ params, request }) => {
    const { owner, repo } = params;
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      number: 456,
      state: "open",
      html_url: `https://github.com/${owner}/${repo}/issues/456`,
      ...body,
    });
  }),

  // POST /repos/:owner/:repo/issues/:issue_number/comments - Create a comment
  http.post(
    `${GITHUB_API_BASE}/repos/:owner/:repo/issues/:issue_number/comments`,
    async ({ params, request }) => {
      const { owner, repo, issue_number } = params;
      const body = (await request.json()) as Record<string, unknown>;

      return HttpResponse.json({
        id: 999,
        body: body.body,
        user: {
          login: "test-user",
          id: 1,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        html_url: `https://github.com/${owner}/${repo}/issues/${issue_number}#issuecomment-999`,
      });
    },
  ),

  // PATCH /repos/:owner/:repo/issues/comments/:comment_id - Update a comment
  http.patch(
    `${GITHUB_API_BASE}/repos/:owner/:repo/issues/comments/:comment_id`,
    async ({ params, request }) => {
      const { owner, repo, comment_id } = params;
      const body = (await request.json()) as Record<string, unknown>;

      return HttpResponse.json({
        id: comment_id,
        body: body.body,
        user: {
          login: "test-user",
          id: 1,
        },
        updated_at: new Date().toISOString(),
        html_url: `https://github.com/${owner}/${repo}/issues/1#issuecomment-${comment_id}`,
      });
    },
  ),

  // GET /repos/:owner/:repo/issues/comments/:comment_id - Get a comment
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/issues/comments/:comment_id`, ({ params }) => {
    const { owner, repo, comment_id } = params;
    return HttpResponse.json({
      id: comment_id,
      body: "Test comment body",
      user: {
        login: "test-user",
        id: 1,
      },
      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
      html_url: `https://github.com/${owner}/${repo}/issues/1#issuecomment-${comment_id}`,
    });
  }),

  // POST /repos/:owner/:repo/issues/:issue_number/labels - Add labels
  http.post(
    `${GITHUB_API_BASE}/repos/:owner/:repo/issues/:issue_number/labels`,
    async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;

      return HttpResponse.json(
        (body.labels as string[] | undefined)?.map((name: string) => ({
          name,
          color: "ededed",
        })) || [],
      );
    },
  ),

  // GET /repos/:owner/:repo/issues/:issue_number/timeline - List timeline events
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/issues/:issue_number/timeline`, ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const perPage = parseInt(url.searchParams.get("per_page") || "100");

    const events = [
      {
        id: 1,
        event: "labeled",
        label: {
          name: "bug",
        },
        created_at: "2025-01-10T10:00:00Z",
        actor: {
          login: "test-user",
          id: 1,
        },
      },
      {
        id: 2,
        event: "commented",
        body: "This is a comment",
        created_at: "2025-01-11T10:00:00Z",
        actor: {
          login: "test-user-2",
          id: 2,
        },
        author_association: "COLLABORATOR",
      },
      {
        id: 3,
        event: "reviewed",
        submitted_at: "2025-01-12T10:00:00Z",
        state: "approved",
        user: {
          login: "test-reviewer",
          id: 3,
        },
        author_association: "MEMBER",
      },
    ];

    return HttpResponse.json(events.slice((page - 1) * perPage, page * perPage));
  }),

  // ==================== GIT ====================

  // GET /repos/:owner/:repo/git/tags/:tag_sha - Get a tag (annotated)
  // Use tag_sha="lightweight-tag" to simulate a non-annotated (lightweight) tag returning 404
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/git/tags/:tag_sha`, ({ params }) => {
    const { owner, repo, tag_sha } = params;
    if (tag_sha === "lightweight-tag")
      return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    return HttpResponse.json({
      node_id: "MDM6VGFn",
      tag: "v1.0.0",
      sha: tag_sha,
      url: `https://api.github.com/repos/${owner}/${repo}/git/tags/${tag_sha}`,
      message: "Release v1.0.0 with new features",
      tagger: {
        name: "Test Tagger",
        email: "tagger@example.com",
        date: "2025-01-15T10:00:00Z",
      },
      object: {
        sha: "commit123",
        type: "commit",
        url: `https://api.github.com/repos/${owner}/${repo}/git/commits/commit123`,
      },
    });
  }),

  // DELETE /repos/:owner/:repo/git/refs/:ref - Delete a reference
  http.delete(`${GITHUB_API_BASE}/repos/:owner/:repo/git/refs/:ref`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // ==================== USERS ====================

  // GET /user - Get authenticated user
  http.get(`${GITHUB_API_BASE}/user`, () => {
    return HttpResponse.json({
      login: "test-authenticated-user",
      id: 1,
      node_id: "MDQ6VXNlcjE=",
      avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
      type: "User",
      name: "Test User",
      company: "Test Company",
      blog: "https://example.com",
      location: "Test Location",
      email: "test@example.com",
      bio: "Test bio",
      public_repos: 10,
      public_gists: 5,
      followers: 100,
      following: 50,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2025-01-15T00:00:00Z",
    });
  }),

  // GET /users/:username - Get a user
  http.get(`${GITHUB_API_BASE}/users/:username`, ({ params }) => {
    const { username } = params;
    return HttpResponse.json({
      login: username,
      id: 12345,
      node_id: "MDQ6VXNlcjEyMzQ1",
      avatar_url: `https://avatars.githubusercontent.com/u/12345?v=4`,
      type: "User",
      name: `${username} Full Name`,
      company: "Test Company",
      blog: "https://example.com",
      location: "Test Location",
      email: null, // public email is usually null
      bio: "Test user bio",
      public_repos: 20,
      public_gists: 10,
      followers: 200,
      following: 100,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2025-01-15T00:00:00Z",
    });
  }),
];
