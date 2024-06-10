import DIE from "@snomiao/die";
import { CNRepos } from "./CNRepos";
import { updateRepoPRs, type GithubRepoPR } from "./fetchRepoPRs";
import { find } from "rambda";
import { CMNodes } from "./CMNodes";
import { CRNodes } from "./CRNodes";
import { CNPulls } from "./CNPulls-bak";
import { slackLinksNotify } from "./slackUrlsNotify";
import { checkRepoPRStatus } from "./checkRepoPRStatus";

if (import.meta.main) {
  const repo = "https://github.com/ltdrdata/ComfyUI-Manager";
  console.log(await updateCNRepoPRStatus(repo));
}
export async function updateCNRepoLinkings(repository: string) {
  // check cm and cr
  const cm = (await CMNodes.findOne({ reference: repository })) ?? undefined;
  const cr = (await CRNodes.findOne({ repository })) ?? undefined;
  await CNRepos.updateOne({ repository }, { $set: { cm } }, { upsert: true });
  await CNRepos.updateOne({ repository }, { $set: { cr } }, { upsert: true });
  return { cm, cr };
}
export async function updateCNRepoPRStatus(repository: string) {
  // fetch pr
  const updated = await updateRepoPRs(repository).catch(async (error) => {
    if (error.message.includes("Not Found")) {
      await slackLinksNotify("[WARN] Repo Not Found", [repository]);
      return await CNRepos.updateOne(
        { repository },
        { $set: { prs: { mtime: new Date(), error: error.message } } },
        { upsert: true }
      );
    }
    DIE(error);
  });
  const prChanged = updated.modifiedCount || updated.upsertedCount;
  // if (!prChanged) return { ...updated, links: [] };

  const valid = await CNRepos.findOne({
    "prs.mtime": { $gt: new Date(+Date.now() - 86400e3) },
  });
  if (valid && !prChanged) return { ...updated, links: [] };

  const { toml, action } = await checkRepoPRStatus(repository);
  const result = await CNRepos.updateOne(
    { repository },
    { $set: { prs: { toml, action, mtime: new Date() } } },
    { upsert: true }
  );
  return {
    ...result,
    links: [
      { name: repository.replace("https://github.com", ""), href: repository },
      toml && parsePRlink(toml),
      action && parsePRlink(action),
    ].flatMap((e) => (e ? [e] : [])),
  };
}

export type PRLink = { name: string; href: string };
export function parsePRlink(e: GithubRepoPR): PRLink {
  const { number, title, html_url, state, merged_at } = e;
  const repo = html_url
    .match(/(.*?\/.*?)(?=\/pull\/\d+$)/g)![0]
    .replace("https://github.com", "");
  return {
    // name: `${repo} PR#${number}: ${(merged_at ? "merged" : state).toUpperCase()}`,
    name: `${html_url.replace("https://github.com", "")} #${(merged_at
      ? "merged"
      : state
    ).toUpperCase()} - ${title}`.slice(0, 78),
    href: html_url,
  };
}
