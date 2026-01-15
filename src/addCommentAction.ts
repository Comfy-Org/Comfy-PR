"use server";
import { $elemMatch } from "@/packages/mongodb-pipeline-ts/$elemMatch";
import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { TaskDataOrNull, type Task } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import pMap from "p-map";
import type { z } from "zod";
import type { PullStatusShown } from "./analyzePullsStatus";
import { CNRepos, type CRPull } from "./CNRepos";
import { createIssueComment } from "./createIssueComment";
import { $flatten } from "./db";
import type { zAddCommentAction } from "./followRuleSchema";
import { ghUser } from "./ghUser";
import type { GithubIssueComment } from "./GithubIssueComments";
import { notifySlackLinks } from "@/lib/slack/notifySlackLinks";

export async function addCommentAction({
  matched,
  action,
  runAction,
  rule,
}: {
  matched: Task<PullStatusShown[]>;
  action: z.infer<typeof zAddCommentAction>;
  runAction: boolean;
  rule: { name: string };
}) {
  return await pMap(
    TaskDataOrNull(matched) ?? DIE("NO-PAYLOAD-AVAILABLE"),
    async (payload) => {
      const loadedAction = {
        action: "add-comment",
        url: payload.url,
        by: action.by,
        body: action.body.replace(
          /{{\$([_A-Za-z0-9]+)}}/g,
          (_, key: string) =>
            (payload as any)[key] ||
            DIE("Missing key: " + key + " in payload: " + JSON.stringify(payload)),
        ),
      };

      if (runAction && loadedAction.by === (await ghUser()).login) {
        const existedCommentsTask =
          (await $pipeline(CNRepos)
            .unwind("$crPulls.data")
            .match({ "crPulls.data.pull.html_url": loadedAction.url })
            .with<{ "crPulls.data": CRPull }>()
            .replaceRoot({ newRoot: "$crPulls.data.comments" })
            .as<Task<GithubIssueComment[]>>()
            .aggregate()
            .next()) ??
          DIE("comments is not fetched before, plz check " + loadedAction.url + " in CNRepos");

        const existedComments =
          TaskDataOrNull(existedCommentsTask) ??
          DIE("NO-COMMENTS-FOUND should never happen here, bcz pipeline filtered at first");
        const existedComment = existedComments.find((e) => e.body === loadedAction.body);

        if (!existedComment) {
          const { comments, comment } = await createIssueComment(
            loadedAction.url,
            loadedAction.body,
            loadedAction.by,
          );
          const updateResult = await CNRepos.updateOne(
            $flatten({ crPulls: { data: $elemMatch({ pull: { html_url: loadedAction.url } }) } }),
            { $set: { "crPulls.data.$.comments": comments } },
          );
          if (!updateResult.matchedCount) DIE("created issue not matched");
          await notifySlackLinks("A New issue comment are created from rule " + rule.name, [
            comment.html_url,
          ]);
        }
      }

      return loadedAction;
    },
    { concurrency: 1 },
  );
}
