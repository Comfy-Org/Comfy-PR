import type { mockPublishedNodes } from "../mocks/mockPublishedNodes";
import DIE from "@snomiao/die";
import { fetchJson } from "./fetchJson";

export async function fetchCRNodes() {
  const r = (await fetchJson<typeof mockPublishedNodes>(
    "https://api.comfy.org/nodes?page=1&limit=99999999"
  )) as typeof mockPublishedNodes;
  r.totalPages === 1 || DIE("FAIL TO FETCH ALL NODES");
  return r.nodes;
}
