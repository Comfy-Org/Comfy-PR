
export async function fetchComfyUIManagerNodeList() {
  const customNodeListSource = process.env.CUSTOM_LIST_SOURCE ||
    "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/custom-node-list.json";
  const nodeList = (await fetch(customNodeListSource).then((e) => e.json()
  )) as {
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
