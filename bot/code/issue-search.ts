import { createOctokit } from "@/lib/github/createOctokit";

/**
 * Search for issues across Comfy-Org repositories
 * @param query - Search query string
 * @param limit - Maximum number of results to return (default: 10)
 * @returns Array of issue results with title, URL, state, repository, and creation date
 */
export async function searchGitHubIssues(query: string, limit: number = 10) {
  try {
    // Create octokit with current environment (allows loading env after import)
    const GH_TOKEN =
      process.env.GH_TOKEN_COMFY_PR ||
      process.env.GH_TOKEN ||
      (() => {
        throw new Error("Missing GH_TOKEN or GH_TOKEN_COMFY_PR environment variable");
      })();

    const octokit = createOctokit({ auth: GH_TOKEN });
    const gh = octokit.rest;

    // Build search query to search across Comfy-Org repositories
    const searchQuery = `org:Comfy-Org ${query}`;

    const response = await gh.search.issuesAndPullRequests({
      q: searchQuery,
      sort: "updated",
      order: "desc",
      per_page: limit,
    });

    return response.data.items.map((item) => ({
      number: item.number,
      title: item.title,
      url: item.html_url,
      state: item.state,
      repository: item.repository_url.split("/").slice(-2).join("/"),
      created_at: item.created_at,
      updated_at: item.updated_at,
      user: item.user?.login,
      labels: item.labels
        .map((label) => (typeof label === "string" ? label : label.name))
        .filter(Boolean),
      is_pull_request: !!item.pull_request,
    }));
  } catch (error: unknown) {
    throw new Error(`GitHub issue search failed: ${(error as Error)?.message || error}`);
  }
}

// CLI usage
if (import.meta.main) {
  const query = process.argv[2] || "bug";
  const limit = parseInt(process.argv[3] || "10", 10);

  console.log(`Searching for: "${query}" (limit: ${limit})\n`);

  const results = await searchGitHubIssues(query, limit);

  console.log(`Found ${results.length} results:\n`);

  for (const issue of results) {
    console.log(`#${issue.number} - ${issue.title}`);
    console.log(`  Repository: ${issue.repository}`);
    console.log(`  State: ${issue.state}`);
    console.log(`  Type: ${issue.is_pull_request ? "Pull Request" : "Issue"}`);
    console.log(`  Author: ${issue.user}`);
    console.log(`  Labels: ${issue.labels.join(", ") || "none"}`);
    console.log(`  URL: ${issue.url}`);
    console.log(`  Updated: ${issue.updated_at}`);
    console.log("---");
  }
}
