import { gh } from "@/lib/github";

type GithubRepo = Awaited<ReturnType<typeof gh.repos.get>>["data"];

/**
 * Pick only the fields we need from a GitHub repository response.
 * This reduces document size from ~5KB to ~300 bytes.
 *
 * Fields kept based on actual usage in codebase:
 * - html_url: repository links
 * - archived: statistics and filtering
 * - default_branch: branch operations
 * - private: access control
 * - owner.login: author tracking
 * - license: license checks
 * - updated_at: activity tracking
 */
export function pickRepoInfo(repo: GithubRepo) {
  return {
    html_url: repo.html_url,
    archived: repo.archived,
    default_branch: repo.default_branch,
    private: repo.private,
    updated_at: repo.updated_at,
    owner: {
      login: repo.owner.login,
    },
    license: repo.license
      ? {
          spdx_id: repo.license.spdx_id,
          name: repo.license.name,
        }
      : null,
  };
}

export type PickedRepoInfo = ReturnType<typeof pickRepoInfo>;
