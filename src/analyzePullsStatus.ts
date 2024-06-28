import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { peekYaml } from "peek-log";
import prettyMs from "pretty-ms";
import type { z } from "zod";
import type { Task } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos, type CRPull } from "./CNRepos";
import type { GithubIssueComment } from "./GithubIssueComments";
import { db } from "./db";
import type { zPullStatus } from "./zod/zPullsStatus";
// import { $pipeline } from "./db/$pipeline";
// in case of dump production in local environment:
// bun --env-file .env.production.local src/dump.ts > dump.csv
export const DashboardDetails = db.collection<any>("DashboardDetails");
if (import.meta.main) {
  const r = peekYaml(await analyzePullsStatus());

  // await mkdir(".cache").catch(() => null);
  // await writeFile(".cache/dump.yaml", YAML.stringify(r));
  // await writeFile(".cache/dump.csv", csvFormat(r));
  // console.log("done");
  // generate zod schema
  // await writeFile("src/zPullsStatus.ts", jsonToZod(await analyzePullsStatus({ limit: 1 }), "zPullsStatus", true));

  // analyzePullsStatusPipeline
}

export type PullStatus = z.infer<typeof zPullStatus>;
export type PullsStatus = PullStatus[];
export async function analyzePullsStatus({ skip = 0, limit = 0, pipeline = analyzePullsStatusPipeline() } = {}) {
  "use server";
  return await pipeline
    .skip(skip)
    .limit(limit || 2 ** 31 - 1)
    .aggregate()
    .map(({ updated_at, created_at, actived_at, on_registry_at, ...pull }) => {
      const pull_updated = prettyMs(+new Date() - +new Date(updated_at), { compact: true }) + " ago";
      const repo_updated = prettyMs(+new Date() - +new Date(actived_at), { compact: true }) + " ago";
      return {
        updated: pull_updated, // @deprecated
        pull_updated,
        repo_updated,
        ...pull,
        lastwords: pull.lastwords?.replace(/\s+/g, " ").replace(/\*\*\*.*/g, "..."),
      };
    })
    .toArray();
}
export function analyzePullsStatusPipeline() {
  return (
    $pipeline(CNRepos)
      .set({ "crPulls.data.pull.latest_comment_at": { $max: { $max: "$crPulls.data.comments.data.updated_at" } } })
      .unwind("$crPulls.data")
      .match({ "crPulls.data.comments.data": { $exists: true } })
      .set({ "crPulls.data.pull.actived_at": { $toDate: "$info.data.updated_at" } })
      .set({ "crPulls.data.pull.repo": "$repository" })
      .set({ "crPulls.data.pull.on_registry": "$on_registry" })
      .set({ "crPulls.data.pull.type": "$crPulls.data.type" })
      .set({ "crPulls.data.pull.comments": "$crPulls.data.comments.data" })
      .set({ "crPulls.data.pull": "$crPulls.data.pull" })
      .replaceRoot({ newRoot: "$crPulls.data.pull" })
      .as<
        CRPull & {
          repo: string;
          on_registry: Task<boolean>;
          type: string;
          comments: GithubIssueComment[];
        }
      >()
      .project({
        created_at: { $toDate: "$created_at" },
        updated_at: { $toDate: "$updated_at" },
        repository: 1,
        on_registry: "$on_registry.data",
        on_registry_at: "$on_registry.mtime",
        state: { $toUpper: `$prState` },
        url: "$html_url",
        author_email: "$base.user.email",
        ownername: "$base.user.login",
        head: { $concat: ["$user.login", ":", "$type"] },
        comments: { $size: "$comments" },
        comments_author: {
           $trim: { input: {$reduce: {
            input: "$comments.user.login",
            initialValue: "",
            in: { $concat: ["$$value", " ", "$$this"] },
          },}, chars: " " } 
        },
        lastwords: { $arrayElemAt: ["$comments", -1] },
        latest_comment_at: { $toDate: "$latest_comment_at" },
        actived_at: 1,
      })
      // .project({ latest_comment_at: {$toDate: '$latest_comment_at'} })
      .set({ updated_at: { $max: ["$latest_comment_at", "$updated_at"] } })
      .project({ latest_comment_at: 0 })
      .set({ lastwords: { $concat: ["$lastwords.user.login", ": ", "$lastwords.body"] } })
      .set({ lastwords: { $ifNull: ["$lastwords", ""] } })
      // .set({ state: { $nin: ["CLOSED"] } })
      .set({
        CLOSED: { $eq: ["$state", "CLOSED"] },
        MERGED: { $eq: ["$state", "MERGED"] },
        OPEN: { $eq: ["$state", "OPEN"] },
      })
      .sort({ ownername: 1 })
      .sort({ OPEN: -1, MERGED: -1, CLOSED: -1, updated_at: 1 })
      .unset(["CLOSED", "MERGED", "OPEN"])
      .as<{
        actived_at: Date;
        author_email: string;
        comments: number;
        created_at: Date;
        head: string;
        lastwords: string;
        on_registry_at: Date;
        on_registry: boolean;
        comments_author: string;
        ownername: string;
        repository: string;
        state: "OPEN" | "MERGED" | "CLOSED";
        updated_at: Date;
        url: string;
      }>()
    // .stage({ ...(!!skip && { $skip: skip }) })
    // .stage({ ...(!!limit && { $limit: limit }) })
  );
}
