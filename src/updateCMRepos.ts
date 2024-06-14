import pMap from "p-map";
import { CMNodes } from "./CMNodes";
import { CNRepos } from "./CNRepos";
import { tLog } from "./utils/tLog";
if (import.meta.main) {
  await tLog("Update Repos from ComfyUI Manager", updateCMRepos);
  console.log(await CMNodes.estimatedDocumentCount());
}
export async function updateCMRepos() {
  await CMNodes.createIndex({ repo_id: 1 });
  return await pMap(CMNodes.find({ repo_id: { $exists: false } }), async (cm, i) => {
    const { reference: repository, _id } = cm;
    await CNRepos.updateOne({ repository }, { $set: { cm } }, { upsert: true });
    await CMNodes.updateOne({ _id }, { $set: { repo_id: cm._id } }, { upsert: true });
  });
}
