import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { csvFormat } from "d3";
import { mkdir } from "fs";
import { writeFile } from "fs/promises";
import prettyMs from "pretty-ms";
import YAML from "yaml";
import { CNRepos } from "./CNRepos";
// import { $pipeline } from "./db/$pipeline";
// in case of dump production in local environment:
// bun --env-file .env.production.local src/dump.ts > dump.csv

if (import.meta.main) {
  const r = await dumpDashboard();
  await mkdir(".cache").catch(() => null);
  await writeFile(".cache/dump.yaml", YAML.stringify(r));
  await writeFile(".cache/dump.csv", csvFormat(r));
  console.log("done");
}
export async function dumpDashboard(limit?: number) {
  "use server";
  return await dumpDashboardPipeline(limit).toArray();
}
export function dumpDashboardPipeline(limit?: number) {
  return $pipeline<any>(CNRepos)
    .unwind("$crPulls.data")
    .match({ "crPulls.data.comments.data": { $exists: true } })
    .set({ "crPulls.data.pull.repo": "$repository" })
    .set({ "crPulls.data.pull.type": "$crPulls.data.type" })
    .set({ "crPulls.data.pull.comments": "$crPulls.data.comments.data" })
    .replaceRoot({ newRoot: "$crPulls.data.pull" })
    .project({
      created_at: 1,
      updated_at: 1,
      repository: 1,
      registryId: "$cr.id",
      state: { $toUpper: `$prState` },
      url: { $concat: ["$html_url", "#", "$user.login", ":", "$type"] },
      comments: { $size: "$comments" },
      lastwords: { $arrayElemAt: ["$comments", -1] },
    })
    .as()
    .set({ lastwords: { $concat: ["$lastwords.user.login", ": ", "$lastwords.body"] } })
    .match({ state: { $nin: ["MERGED"] } })
    .stage({ $sort: { updated_at: 1 } })
    .stage({ ...(limit && { $limit: limit }) })
    .aggregate()
    .map(({ updated_at, created_at, ...pull }) => {
      const updated = prettyMs(+new Date() - +new Date(updated_at), { compact: true }) + " ago";
      const created = prettyMs(+new Date() - +new Date(created_at), { compact: true }) + " ago";
      return {
        updated, //: updated === created ? "never" : updated,
        ...pull,
        created,
      };
    });
}
