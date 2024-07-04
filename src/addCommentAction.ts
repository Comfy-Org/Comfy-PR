"use server";
import { $elemMatch } from "@/packages/mongodb-pipeline-ts/$elemMatch";
import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { TaskDataOrNull, type Task } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import pMap from "p-map";
import { CNRepos, type CRPull } from "./CNRepos";
import { createIssueComment } from "./createIssueComment";
import { $filaten } from "./db";
import { ghUser } from "./ghUser";
import type { GithubIssueComment } from "./GithubIssueComments";
import { notifySlackLinks } from "./slack/notifySlackLinks";

export async function addCommentAction({ matched, action, runAction, rule }: { matched: { state: "ok"; mtime: Date; data: { lastwords: string; email: string | ""; comments: number; head: string; on_registry: boolean; comments_author: string; ownername: string; nickName: string; repository: string; state: "OPEN" | "MERGED" | "CLOSED"; url: string; updated: string; pull_updated: string; repo_updated: string; }[]; } | { state: "error"; mtime: Date; error: string; }; action: { by: string; body: string; }; runAction: boolean; rule: { name: string; $match: { actived_at?: Date | { $lt: Date; } | { $gte: Date; } | { $not: { $gt: Date; }; } | undefined; email?: string | RegExp | undefined; comments?: number | { $gt: number; } | { $lt: number; } | { $eq: number; } | { $ne: number; } | { $gte: number; } | { $lte: number; } | undefined; created_at?: Date | { $lt: Date; } | { $gte: Date; } | { $not: { $gt: Date; }; } | undefined; comments_author?: string | RegExp | undefined; head?: string | RegExp | undefined; lastwords?: string | RegExp | undefined; on_registry?: boolean | undefined; nickName?: string | RegExp | undefined; ownername?: string | RegExp | undefined; state?: "OPEN" | "CLOSED" | "MERGED" | undefined; updated_at?: Date | { $lt: Date; } | { $gte: Date; } | { $not: { $gt: Date; }; } | undefined; url?: string | RegExp | undefined; }; action: { "add-comment"?: { by: string; body: string; } | undefined; "send-email"?: { body: string; provider: string; from: string; to: string; subject: string; } | undefined; "update-issue"?: { tags: string | number | RegExp | { $lt: Date; } | { $gte: Date; } | { $nin: string; }; } | undefined; }; }; }) {
  return await pMap(
    TaskDataOrNull(matched) ?? DIE("NO-PAYLOAD-AVAILABLE"),
    async (payload) => {
      const loadedAction = {
        action: "add-comment",
        url: payload.url,
        by: action.by,
        body: action.body.replace(
          /{{\$(\w+)}}/,
          (_, key: string) => (payload as any)[key] ||
            DIE("Missing key: " + key + " in payload: " + JSON.stringify(payload))
        ),
      };

      if (runAction && loadedAction.by === ghUser.login) {
        const existedCommentsTask = (await $pipeline(CNRepos)
          .unwind("$crPulls.data")
          .match({ "crPulls.data.pull.html_url": loadedAction.url })
          .with<{ "crPulls.data": CRPull; }>()
          .replaceRoot({ newRoot: "$crPulls.data.comments" })
          .as<Task<GithubIssueComment[]>>()
          .aggregate()
          .next()) ??
          DIE("comments is not fetched before, plz check " + loadedAction.url + " in CNRepos");

        const existedComments = TaskDataOrNull(existedCommentsTask) ??
          DIE("NO-COMMENTS-FOUND should never happen here, bcz pipeline filtered at first");
        const existedComment = existedComments.find((e) => e.body === loadedAction.body);

        if (!existedComment) {
          const { comments, comment } = await createIssueComment(
            loadedAction.url,
            loadedAction.body,
            loadedAction.by
          );
          const updateResult = await CNRepos.updateOne(
            $filaten({ crPulls: { data: $elemMatch({ pull: { html_url: loadedAction.url } }) } }),
            { $set: { "crPulls.data.$.comments": comments } }
          );
          if (!updateResult.matchedCount) DIE("created issue not matched");
          await notifySlackLinks("A New issue comment are created from rule " + rule.name, [
            comment.html_url,
          ]);
        }
      }

      return loadedAction;
    },
    { concurrency: 1 }
  );
}
