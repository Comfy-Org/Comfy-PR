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
  return await fetchAllPages((page) =>
    fetchJson<RegistryNodesPage<CRNode>>(
      `https://api.comfy.org/nodes?page=${page}&limit=100`,
    ),
  );
}

type RegistryNodesPage<T> = { nodes: T[]; totalPages: number };
type CRNode = (typeof mockPublishedNodes)["nodes"][number];

/** Reads every page; the registry caps limit at 100 per page. */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<RegistryNodesPage<T>>,
): Promise<T[]> {
  const first = await fetchPage(1);
  if (!Array.isArray(first?.nodes)) DIE("FAIL TO FETCH ALL NODES");
  const totalPages = first.totalPages;
  if (!Number.isSafeInteger(totalPages) || totalPages < 1)
    DIE(`FAIL TO FETCH ALL NODES: invalid totalPages ${String(totalPages)}`);
  const nodes = [...first.nodes];
  for (let page = 2; page <= totalPages; page++) {
    const r = await fetchPage(page);
    if (!Array.isArray(r?.nodes)) DIE(`FAIL TO FETCH NODES PAGE ${page}`);
    nodes.push(...r.nodes);
  }
  return nodes;
}
