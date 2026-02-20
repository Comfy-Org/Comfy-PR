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
  const r = (await fetchJson<typeof mockPublishedNodes>(
    "https://api.comfy.org/nodes?page=1&limit=99999999",
  )) as typeof mockPublishedNodes;
  if (r.totalPages !== 1) DIE("FAIL TO FETCH ALL NODES");
  return r.nodes;
}
