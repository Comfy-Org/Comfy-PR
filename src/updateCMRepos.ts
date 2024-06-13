import pMap from "p-map";
import { slackNotify } from "./SlackNotifications";
import { CMNodes } from "./CMNodes";
import { CNRepos } from "./CNRepos";

export async function updateCMRepos() {
  await pMap(CMNodes.find({ repo_id: { $exists: false } }), async (cm, i) => {
    const { reference: repository, _id } = cm;
    await CNRepos.updateOne({ repository }, { $set: { cm } }, { upsert: true });
    await CMNodes.updateOne({ _id }, { $set: { repo_id: cm._id } });
    // silent
    // await slackNotify(`New Repo from ComfyManager found ${i}: ${repository}`);
  });
}
