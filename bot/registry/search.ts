import { fetchCRNodes } from "../../src/fetchComfyRegistryNodes";

export interface RegistryNode {
  id: string;
  name: string;
  description: string;
  author: string;
  repository: string;
  downloads: number;
  github_stars: number;
  tags: string[];
  publisher: {
    name: string;
    id: string;
  };
  latest_version: {
    version: string;
    deprecated: boolean;
  };
}

export interface SearchOptions {
  query: string;
  limit?: number;
  includeDeprecated?: boolean;
}

/**
 * Search for custom nodes in the ComfyUI registry
 * @param options - Search options including query string and filters
 * @returns Array of matching nodes
 */
export async function searchRegistryNodes(options: SearchOptions): Promise<RegistryNode[]> {
  const { query, limit = 10, includeDeprecated = false } = options;

  // Fetch all nodes from the registry
  const allNodes = await fetchCRNodes();

  // Filter nodes based on search query
  const searchLower = query.toLowerCase();
  const filtered = allNodes
    .filter((node) => {
      // Filter out deprecated nodes unless explicitly included
      if (!includeDeprecated && node.latest_version?.deprecated) {
        return false;
      }

      // Search across multiple fields
      const searchFields = [
        node.name,
        node.description,
        node.author,
        node.id,
        node.publisher?.name,
        node.repository,
        ...(node.tags || []),
      ]
        .filter(Boolean)
        .map((field) => String(field).toLowerCase());

      return searchFields.some((field) => field.includes(searchLower));
    })
    .slice(0, limit)
    .map((node) => ({
      id: node.id,
      name: node.name,
      description: node.description,
      author: node.author,
      repository: node.repository,
      downloads: (node as any).downloads || 0,
      github_stars: (node as any).github_stars || 0,
      tags: node.tags || [],
      publisher: {
        name: node.publisher?.name || "",
        id: node.publisher?.id || "",
      },
      latest_version: {
        version: node.latest_version?.version || "",
        deprecated: node.latest_version?.deprecated || false,
      },
    }));

  return filtered;
}

// CLI usage
if (import.meta.main) {
  const query = process.argv[2];
  const limit = parseInt(process.argv[3] || "10", 10);

  if (!query) {
    console.error("Usage: bun bot/registry/search.ts <query> [limit]");
    console.error("Example: bun bot/registry/search.ts video 5");
    process.exit(1);
  }

  console.log(`Searching for: "${query}" (limit: ${limit})\n`);

  const results = await searchRegistryNodes({ query, limit });

  console.log(`Found ${results.length} results:\n`);

  for (const node of results) {
    console.log(`📦 ${node.name} (${node.id})`);
    console.log(
      `   ${node.description.substring(0, 100)}${node.description.length > 100 ? "..." : ""}`,
    );
    console.log(`   Publisher: ${node.publisher.name}`);
    console.log(`   Version: ${node.latest_version.version}`);
    console.log(`   Repository: ${node.repository}`);
    console.log(`   Downloads: ${node.downloads} | Stars: ${node.github_stars}`);
    if (node.tags.length > 0) {
      console.log(`   Tags: ${node.tags.join(", ")}`);
    }
    console.log("");
  }
}
