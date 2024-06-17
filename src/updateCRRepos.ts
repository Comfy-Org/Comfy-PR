import pMap from "p-map";
import { CNRepos } from "./CNRepos";
import { CRNodes } from "./CRNodes";

export async function updateCRRepos() {
  await CRNodes.createIndex({ repo_id: 1 });
  return await pMap(CRNodes.find({ repo_id: { $exists: false } }), async (cr, i) => {
    const { repository, _id } = cr;
    await CNRepos.updateOne(
      { repository },
      {
        $set: {
          cr: (await CRNodes.findOneAndUpdate(
            { _id },
            { $set: { repo_id: cr._id } },
            { upsert: true, returnDocument: "after" },
          ))!,
        },
      },
      { upsert: true },
    );
  });
}
