import DIE from "@snomiao/die";
import type { mockPublishedNodes } from "../mocks/mockPublishedNodes";
import { fetchJson } from "./utils/fetchJson";

export async function fetchCRNodes(): Promise<
  {
    author: string;
    description: string;
    icon: string;
    id: string;
    latest_version: {
      changelog: string;
      createdAt: string;
      dependencies: never[];
      deprecated: boolean;
      id: string;
      version: string;
    };
    license: string;
    name: string;
    publisher: {
      createdAt: string;
      description: string;
      id: string;
      logo: string;
      members: never[];
      name: string;
      source_code_repo: string;
      support: string;
      website: string;
    };
    repository: string;
    tags: never[];
  }[]
> {
  return (await fetchAllPages((page) =>
    fetchJson<unknown>(`https://api.comfy.org/nodes?page=${page}&limit=100`),
  )) as (typeof mockPublishedNodes)["nodes"];
}

/** Reads every page; the registry caps limit at 100 per page. */
export async function fetchAllPages(
  fetchPage: (page: number) => Promise<unknown>,
): Promise<unknown[]> {
  const first = await fetchPage(1);
  const firstNodes = pageNodes(first);
  if (!firstNodes) return DIE("FAIL TO FETCH ALL NODES");
  const totalPages = (first as { totalPages?: unknown }).totalPages;
  if (typeof totalPages !== "number" || !Number.isSafeInteger(totalPages) || totalPages < 1)
    return DIE(`FAIL TO FETCH ALL NODES: invalid totalPages ${String(totalPages)}`);
  const nodes = [...firstNodes];
  for (let page = 2; page <= totalPages; page++) {
    const pageItems = pageNodes(await fetchPage(page));
    if (!pageItems) return DIE(`FAIL TO FETCH NODES PAGE ${page}`);
    nodes.push(...pageItems);
  }
  return nodes;
}

function pageNodes(page: unknown): unknown[] | undefined {
  if (typeof page !== "object" || page === null) return undefined;
  const nodes = (page as { nodes?: unknown }).nodes;
  return Array.isArray(nodes) ? nodes : undefined;
}
