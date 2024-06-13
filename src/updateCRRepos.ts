import pMap from "p-map";
import { CRNodes } from "./CRNodes";
import { slackNotify } from "./SlackNotifications";
import { CNRepos } from "./CNRepos";

export async function updateCRRepos() {
  await pMap(CRNodes.find({ repo_id: { $exists: false } }), async (cr, i) => {
    const { repository, _id } = cr;
    await CNRepos.updateOne({ repository }, { $set: { cr } }, { upsert: true });
    await CRNodes.updateOne({ _id }, { $set: { repo_id: cr._id } });
    // silent
    // await slackNotify(`New Repo from ComfyRegistry found ${i}: ${repository}`);
  });
}
