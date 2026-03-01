import type { GithubPull } from "./GithubPull";

/**
 * Parse a GitHub pull request to extract only the fields we need.
 * This reduces document size from ~17KB to ~500 bytes per PR.
 *
 * Previously used `...e` spread which included all 39+ GitHub API fields.
 */
export function parsePull(e: GithubPull) {
  return {
    // Essential identification
    number: e.number,
    title: e.title,
    url: e.html_url,
    html_url: e.html_url,

    // State info
    state: e.state,
    prState:
      e.state === "open"
        ? ("open" as const)
        : e.merged_at
          ? ("merged" as const)
          : ("closed" as const),

    // Content
    body: e.body,

    // Author (minimal)
    user: {
      login: e.user.login,
      html_url: e.user.html_url,
    },

    // Timestamps
    created_at: new Date(e.created_at),
    updated_at: new Date(e.updated_at),
    merged_at: e.merged_at ? new Date(e.merged_at) : null,
    closed_at: e.closed_at ? new Date(e.closed_at) : null,

    // Aliases for backwards compatibility
    createdAt: new Date(e.created_at),
    updatedAt: new Date(e.updated_at),
  };
}
