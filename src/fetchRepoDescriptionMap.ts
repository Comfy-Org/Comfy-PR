import { fromPairs } from "rambda";
import { fetchComfyUIManagerNodeList } from "./fetchComfyUIManagerNodeList";


export async function fetchRepoDescriptionMap() {
  const nodeList = await fetchComfyUIManagerNodeList();
  const repoDescriptionMap = fromPairs(
    nodeList.map((e) => [e.reference, e.description])
  );
  repoDescriptionMap["https://github.com/snomiao/ComfyNode-Registry-test"] =
    "ComfyNode-Registry-test-description";

  console.log("Fetched " + nodeList.length + " CustomNode descriptions");
  return repoDescriptionMap;
}
