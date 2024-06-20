"use server";
import { $elemMatch } from "@/packages/mongodb-pipeline-ts/$elemMatch";
import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { TaskDataOrNull } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import pMap from "p-map";
import { peekYaml } from "peek-log";
import { TaskError, TaskOK, type Task } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos, type CRPull } from "./CNRepos";
import { FollowRuleSets } from "./FollowRules";
import type { GithubIssueComment } from "./GithubIssueComments";
import { analyzePullsStatusPipeline, type PullStatus } from "./analyzePullsStatus";
import { createIssueComment } from "./createIssueComment";
import { $filaten } from "./db";
import { zAddCommentAction, zFollowUpRules } from "./followRuleSchema";
import { fetchIssueComments } from "./gh/fetchIssueComments";
import { ghUser } from "./ghUser";
import { initializeFollowRules } from "./initializeFollowRules";
import { stringifyGithubRepoUrl } from "./parseOwnerRepo";
import { parsePullUrl } from "./parsePullUrl";
import { notifySlackLinks } from "./slack/notifySlackLinks";
import { prettyMs } from "./utils/tLog";
import { yaml } from "./utils/yaml";

if (import.meta.main) {
  // updateFollowRuleSet({yaml: 'default'})
  await FollowRuleSets.drop();
  const defaultRuleSet = await initializeFollowRules();

  await updateFollowRuleSet({ name: "default", enable: true, yaml: defaultRuleSet.yaml });
  await runFollowRuleSet();
}

export async function runFollowRuleSet({ name = "default" } = {}) {
  const ruleset = (await FollowRuleSets.findOne({ name })) ?? DIE("default ruleset not found");
  return peekYaml(
    await updateFollowRuleSet({
      name: ruleset.name,
      enable: ruleset.enabled ?? DIE("Ruleset is not enabled"),
      yaml: ruleset.yamlWhenEnabled ?? DIE("Enabled yaml is not found"),
      runAction: true,
    }),
  );
}
export type updateFollowRuleSet = typeof updateFollowRuleSet;
export async function updateFollowRuleSet({
  name,
  yaml: code,
  enable,
  runAction = false,
}: {
  name: string;
  /** update yaml if provided */
  yaml?: string;
  /** update enable if provided */
  enable?: boolean | undefined;
  /** run action if set to true */
  runAction?: boolean;
}) {
  "use server";
  return await (async function () {
    if (enable === false) {
      await FollowRuleSets.updateOne({ name }, { $set: { enabled: false, yamlWhenEnabled: "" } });
      DIE("ruleset is disabled, no need to run");
    }

    // must parse while run, because the date in code is dynamic generated
    const rules = zFollowUpRules.parse(yaml.parse(code || DIE("yaml is empty")));
    // save if parse succ
    // await FollowRuleSets.updateOne({ name }, { $set: { yaml: code, rules } });
    const parseResult = await pMap(
      rules,
      async (rule) => {
        if (runAction) {
          // pre-fetch comments before run a rule -> match -> action, to prevent comment on a outdated pull state
          const preMatched = await analyzePullsStatusPipeline()
            .match(rule.$match)
            .aggregate()
            .map(({ updated_at, created_at, on_registry_at, ...pull }) => {
              const updated = prettyMs(+new Date() - +new Date(updated_at), { compact: true }) + " ago";
              return {
                updated, //: updated === created ? "never" : updated,
                ...pull,
                lastwords: pull.lastwords?.replace(/\s+/g, " ").replace(/\*\*\*.*/g, "..."),
              } as PullStatus;
            })
            .toArray()
            .then(TaskOK)
            .catch(TaskError);

          // update comments before run action
          const matchedData = TaskDataOrNull(preMatched) ?? DIE("NO-PAYLOAD-AVAILABLE");
          await pMap(matchedData, async (payload) => {
            const html_url = payload.url;
            const { owner, repo, pull_number } = parsePullUrl(payload.url);
            const repository = stringifyGithubRepoUrl({ owner, repo });

            const comments = await fetchIssueComments(repository, { number: pull_number })
              .then(TaskOK)
              .catch(TaskError);
            (await CNRepos.updateOne(
              $filaten({ repository, crPulls: { data: { pull: { html_url } } } }),
              { $set: { "crPulls.data.$.comments": comments } },
            )).matchedCount ?? DIE("pre-matched comments is not found");
          });
        }

        const matched = await analyzePullsStatusPipeline()
          .match(rule.$match)
          .aggregate()
          .map(({ updated_at, created_at, on_registry_at, ...pull }) => {
            const updated = prettyMs(+new Date() - +new Date(updated_at), { compact: true }) + " ago";
            return {
              updated, //: updated === created ? "never" : updated,
              ...pull,
              lastwords: pull.lastwords?.replace(/\s+/g, " ").replace(/\*\*\*.*/g, "..."),
            } as PullStatus;
          })
          .toArray()
          .then(TaskOK)
          .catch(TaskError);

        const actions = await (async function () {
          return await pMap(
            Object.entries(rule.action),
            async ([name, _action]) => {
              if (name === "add-comment") {
                const action = zAddCommentAction.parse(_action);
                const matchedData = TaskDataOrNull(matched) ?? DIE("NO-PAYLOAD-AVAILABLE");
                return await pMap(
                  matchedData,
                  async (payload) => {
                    const loadedAction = {
                      action: "add-comment",
                      url: payload.url,
                      by: action.by,
                      body: action.body.replace(
                        /{{\$(\w+)}}/,
                        (_, key: string) =>
                          (payload as any)[key] ||
                          DIE("Missing key: " + key + " in payload: " + JSON.stringify(payload)),
                      ),
                    };

                    if (runAction && loadedAction.by === ghUser.login) {
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
                          $filaten({ crPulls: { data: $elemMatch({ pull: { html_url: loadedAction.url } }) } }),
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
            },
            { concurrency: 1 },
          );
        })()
          .then(TaskOK)
          .catch(TaskError);

        return { name: rule.name, matched, actions };
      },
      { concurrency: 1 },
    );
    if (enable) {
      await FollowRuleSets.updateOne({ name }, { $set: { enabled: true, yamlWhenEnabled: code, yaml: code } });
    } else {
      await FollowRuleSets.updateOne({ name }, { $set: { yaml: code } });
    }
    return parseResult;
  })()
    .then(TaskOK)
    .catch(TaskError);
}
