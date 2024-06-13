import { fetchJson } from "./fetchJson";

if (import.meta.main) {
  console.log(await fetchCMNodes());
}
export async function fetchCMNodes() {
  const customNodeListSource =
    process.env.CUSTOM_LIST_SOURCE ||
    "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/custom-node-list.json";
  const nodeList = (await fetchJson(customNodeListSource)) as {
    custom_nodes: {
      author: "Dr.Lt.Data" | string;
      title: "ComfyUI-Manager" | string;
      id: "manager" | string;
      reference: "https://github.com/ltdrdata/ComfyUI-Manager" | string;
      files: ["https://github.com/ltdrdata/ComfyUI-Manager"] | string[];
      install_type: "git-clone" | string;
      description: "ComfyUI-Manager itself is also a custom node." | string;
    }[];
  };
  return nodeList.custom_nodes;
}
