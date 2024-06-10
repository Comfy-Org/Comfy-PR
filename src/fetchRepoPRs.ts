import Keyv from "keyv";
import { mkdir } from "fs/promises";
import { gh } from "./gh";
import { repoUrlParse } from "./parseOwnerRepo";
import { KeyvCachedWith } from "keyv-cached-with";
import { db } from "./db";
import { pickAll, times } from "rambda";
export type GithubRepoPR = GithubRepoPRs["prs"][number];
export type GithubRepoPRs = Awaited<ReturnType<typeof fetchRepoPRs>>;
export const GithubRepoPRss = db.collection<GithubRepoPRs>("GithubRepoPRss");
await GithubRepoPRss.createIndex({ repo: 1 }, { unique: true });

if (import.meta.main) {
  const repo = "https://github.com/ltdrdata/ComfyUI-Manager";
  await findRepoPRs(repo).then(console.log);
  await updateRepoPRs(repo).then(console.log);
}
export async function updateRepoPRs(repo: string) {
  const valid = await findRepoPRs(repo);
  const updateResult = await GithubRepoPRss.updateOne(
    { repo },
    { $set: valid || (await fetchRepoPRs(repo)) },
    { upsert: true }
  );
  return updateResult;
}
export async function findRepoPRs(repo: string) {
  return await GithubRepoPRss.findOne({
    repo,
    mtime: { $gt: new Date(+Date.now() - 86400e3) },
  });
}

async function fetchRepoPRs(repo: string) {
  console.log("Fetching repo prs: " + repo);
  const prsraw = await gh.pulls.list({ ...repoUrlParse(repo), state: "all" });
  const prs = prsraw.data.map(
    ({
      html_url,
      state,
      merged_at,
      assignee,
      number,
      closed_at,
      created_at,
      updated_at,
      title,
    }) => ({
      html_url,
      state,
      merged_at,
      assignee,
      number,
      closed_at,
      created_at,
      updated_at,
      title,
    })
  );
  return { repo, mtime: new Date(), prs };
}
