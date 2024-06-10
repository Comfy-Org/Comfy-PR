import type { mockPublishedNodes } from "../mocks/mockPublishedNodes";
import DIE from "@snomiao/die";

export async function fetchComfyRegistryNodes() {
  const res = await fetch("https://api.comfy.org/nodes?page=1&limit=99999999");
  const json = (await res.json()) as typeof mockPublishedNodes;
  json.totalPages === 1 || DIE("FAIL TO FETCH ALL NODES");
  return json.nodes;
}
