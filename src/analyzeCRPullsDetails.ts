import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { csvFormat } from "d3";
import { mkdir, writeFile } from "fs/promises";
import prettyMs from "pretty-ms";
import YAML from "yaml";
import { CNRepos } from "./CNRepos";
import { db } from "./db";
// import { $pipeline } from "./db/$pipeline";
// in case of dump production in local environment:
// bun --env-file .env.production.local src/dump.ts > dump.csv
const DashboardDetails = db.collection<any>("DashboardDetails");
if (import.meta.main) {
  const r = await analyzeCRPullsDetails();
  await mkdir(".cache").catch(() => null);
  await writeFile(".cache/dump.yaml", YAML.stringify(r));
  await writeFile(".cache/dump.csv", csvFormat(r));
  console.log("done");
}
export async function analyzeCRPullsDetails({ skip = 0, limit = 0 } = {}) {
  "use server";
  return await dumpDashboardPipeline({ skip, limit })
    .aggregate()
    .map(({ updated_at, created_at, ...pull }) => {
      const updated = prettyMs(+new Date() - +new Date(updated_at), { compact: true }) + " ago";
      return {
        updated, //: updated === created ? "never" : updated,
        ...pull,
        lastwords: pull.lastwords?.replace(/\s+/g, " ").replace(/\*\*\*.*/g, "..."),
      };
    })
    .toArray();
}
export function dumpDashboardPipeline({ skip = 0, limit = 0 } = {}) {
  return (
    $pipeline<any>(CNRepos)
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
      // .set({ state: { $nin: ["CLOSED"] } })
      .set({
        CLOSED: { $eq: ["$state", "CLOSED"] },
        MERGED: { $eq: ["$state", "MERGED"] },
        OPEN: { $eq: ["$state", "OPEN"] },
      })
      .stage({ $sort: { OPEN: -1, MERGED: -1, CLOSED: -1, updated_at: 1 } })
      .stage({ $unset: ["CLOSED", "MERGED", "OPEN"] })
      .stage({ ...(!!skip && { $skip: skip }) })
      .stage({ ...(!!limit && { $limit: limit }) })
  );
}
