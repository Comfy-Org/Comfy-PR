import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import prettyMs from "pretty-ms";
import { snoflow } from "snoflow";
import type { z } from "zod";
import type { Task } from "../packages/mongodb-pipeline-ts/Task";
import type { Author } from "./Authors";
import { CNRepos, type CRPull } from "./CNRepos";
import type { GithubIssueComment } from "./GithubIssueComments";
import { db } from "./db";
import type { zPullStatus } from "./zod/zPullsStatus";
// import { $pipeline } from "./db/$pipeline";
// in case of dump production in local environment:
// bun --env-file .env.production.local src/dump.ts > dump.csv
export const DashboardDetails = db.collection<any>("DashboardDetails");
if (import.meta.main) {
  // const r = peekYaml(await analyzePullsStatus());

  // await mkdir(".cache").catch(() => null);
  // await writeFile(".cache/dump.yaml", YAML.stringify(r));
  // await writeFile(".cache/dump.csv", csvFormat(r));
  // console.log("done");
  // generate zod schema
  // await writeFile("src/zPullsStatus.ts", jsonToZod(await analyzePullsStatus({ limit: 1 }), "zPullsStatus", true));

  // analyzePullsStatusPipeline
  await snoflow(analyzePullsStatusPipeline().aggregate())
    // .filter(e=>e.email)
    .peek(console.log)
    .done();
}

export type PullStatus = z.infer<typeof zPullStatus>;
export type PullsStatus = PullStatus[];
export type PullStatusShown = Awaited<ReturnType<typeof analyzePullsStatus>>[number];
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
export function baseCRPullStatusPipeline() {
  return (
    $pipeline(CNRepos)
      // get latest pr comments time
      .set({ "crPulls.data.pull.latest_comment_at": { $max: { $max: "$crPulls.data.comments.data.updated_at" } } })
      // unwind
      .stage({ $unwind: "$crPulls.data" })
      .match({ "crPulls.data.comments.data": { $exists: true } })
      // repo infos
      .set({ "crPulls.data.pull.actived_at": { $toDate: "$info.data.updated_at" } })
      .set({ "crPulls.data.pull.repo": "$repository" })
      .set({ "crPulls.data.pull.email": "$email" })
      .set({ "crPulls.data.pull.on_registry": "$on_registry" })
      // pull info
      .set({ "crPulls.data.pull.type": "$crPulls.data.type" })
      .set({ "crPulls.data.pull": "$crPulls.data.pull" })
      .set({ "crPulls.data.pull.comments": "$crPulls.data.comments.data" })
      // replace root as pull
      .replaceRoot({ newRoot: "$crPulls.data.pull" })
      .as<
        CRPull & {
          repo: string;
          on_registry: Task<boolean>;
          type: string;
          comments: GithubIssueComment[];
        }
      >()
  );
}
export function analyzePullsStatusPipeline() {
  return (
    baseCRPullStatusPipeline()
      // fetch author email from Authors collection
      .set({ ownername: "$base.user.login" })
      .lookup({
        from: "Authors",
        // let: { <var_1>: <expression>, …, <var_n>: <expression> },
        localField: "ownername",
        foreignField: "githubId",
        as: "authors",
        pipeline: [{ $project: { email: 1 } }],
      })
      .with<{ authors: Author[] }>()
      .set({ author: { $arrayElemAt: ["$authors", 0] } })
      .project({ authors: 0 })

      .set({ lastwords: { $arrayElemAt: ["$comments", -1] } })
      .set({ lastwords: { $ifNull: [{ $concat: ["$lastwords.user.login", ": ", "$lastwords.body"] }, ""] } })

      // calculate update_at max( )
      // date format convert
      .set({ created_at: { $toDate: "$created_at" } })
      .set({ updated_at: { $toDate: "$updated_at" } })
      .set({ latest_comment_at: { $toDate: "$latest_comment_at" } })
      .set({ updated_at: { $max: ["$latest_comment_at", "$updated_at"] } })

      // // projecting
      .project({
        created_at: 1,
        updated_at: 1,
        repository: 1,
        on_registry: "$on_registry.data",
        on_registry_at: "$on_registry.mtime",
        state: { $toUpper: `$prState` },
        url: "$html_url",
        ownername: "$base.user.login",
        nickName: "$base.user.name",
        head: { $concat: ["$user.login", ":", "$type"] },
        comments: { $size: "$comments" },
        comments_author: {
          $trim: {
            input: {
              $reduce: {
                input: "$comments.user.login",
                initialValue: "",
                in: { $concat: ["$$value", " ", "$$this"] },
              },
            },
            chars: " ",
          },
        },
        lastwords: 1,
        actived_at: 1,

        instagramId: "$author.instagramId",
        discordId: "$author.discordId",
        twitterId: "$author.twitterId",
        email: { $ifNull: ["$author.email", ""] },
      })
      // .project({ latest_comment_at: {$toDate: '$latest_comment_at'} })
      .project({ latest_comment_at: 0 })
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
        email: string | "";
        comments: number;
        created_at: Date;
        head: string;
        lastwords: string;
        on_registry_at: Date;
        on_registry: boolean;
        comments_author: string;
        ownername: string;
        nickName: string;
        repository: string;
        state: "OPEN" | "MERGED" | "CLOSED";
        updated_at: Date;
        url: string;
      }>()
  );
}
