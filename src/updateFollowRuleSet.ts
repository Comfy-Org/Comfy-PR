"use server";
import { TaskDataOrNull } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import pMap from "p-map";
import { peekYaml } from "peek-log";
import { TaskError, TaskOK } from "../packages/mongodb-pipeline-ts/Task";
import { CNRepos } from "./CNRepos";
import { FollowRuleSets } from "./FollowRules";
import { addCommentAction } from "./addCommentAction";
import { analyzePullsStatus, analyzePullsStatusPipeline } from "./analyzePullsStatus";
import { $flatten } from "./db";
import { zAddCommentAction, zFollowUpRules, zSendEmailAction } from "./followRuleSchema";
import { fetchIssueComments } from "@/lib/github/fetchIssueComments";
import { stringifyGithubRepoUrl } from "./parseOwnerRepo";
import { parsePullUrl } from "./parsePullUrl";
import { sendEmailAction } from "./sendEmailAction";
import { yaml } from "./utils/yaml";

if (import.meta.main) {
  // const defaultRuleSet = await initializeFollowRules();
  // await updateFollowRuleSet({ name: "default", enable: true, yaml: defaultRuleSet.yaml });
  // await runFollowRuleSet();
}

export async function runFollowRuleSet({ name = "default" } = {}) {
  const ruleset = (await FollowRuleSets.findOne({ name })) ?? DIE("default ruleset not found");

  console.log("RUNNING ruleset:");
  console.log(ruleset.yamlWhenEnabled);
  return peekYaml(
    await updateFollowRuleSet({
      name: ruleset.name,
      enable: ruleset.enabled || DIE(new Error("Ruleset is not enabled")),
      yaml: ruleset.yamlWhenEnabled || DIE("Enabled yaml is not found"),
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
  /** 'default' */
  name: string;
  /** update yaml if provided, unchange if undefined */
  yaml?: string;
  /** update enable if provided, unchange if undefined */
  enable?: boolean | undefined;
  /** run action if true */
  runAction?: boolean;
}) {
  "use server";
  return await (async function () {
    if (enable === false) {
      await FollowRuleSets.updateOne({ name }, { $set: { enabled: false, yamlWhenEnabled: "" } });
      DIE`ruleset is disabled, no need to run`;
    }

    // must parse while run, because the date in code is dynamic generated
    const rules = zFollowUpRules.parse(yaml.parse(code || DIE`yaml is empty`));
    // save if parse succ
    // await FollowRuleSets.updateOne({ name }, { $set: { yaml: code, rules } });

    // todo: enhance performance
    const parseResult = await pMap(
      rules,
      async (rule) => {
        if (runAction) {
          // pre-fetch comments before run a rule -> match -> action, to prevent comment on a outdated pull state
          const preMatched = await analyzePullsStatus({
            pipeline: analyzePullsStatusPipeline().match(rule.$match),
          })
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
            (
              await CNRepos.updateOne(
                $flatten({ repository, crPulls: { data: { pull: { html_url } } } }),
                {
                  $set: { "crPulls.data.$.comments": comments },
                },
              )
            ).matchedCount ?? DIE("pre-matched comments is not found");
          });
        }

        const matched = await analyzePullsStatus({
          pipeline: analyzePullsStatusPipeline().match(rule.$match),
        })
          .then(TaskOK)
          .catch(TaskError);

        const actions = await (async function () {
          return await pMap(
            Object.entries(rule.action),
            async ([name, _action]) => {
              if (name === "add-comment") {
                const action = zAddCommentAction.parse(_action);
                return await addCommentAction({ matched, action, runAction, rule });
              }
              if (name === "send-email") {
                const action = zSendEmailAction.parse(_action);
                return await sendEmailAction({ matched, action, runAction, rule });
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

    if (enable === true) {
      await FollowRuleSets.updateOne(
        { name },
        {
          $set: { enabled: true, yamlWhenEnabled: code, yaml: code },
          $push: { enableHistory: { mtime: new Date(), yaml: code } },
        },
      );
    } else {
      await FollowRuleSets.updateOne({ name }, { $set: { yaml: code } });
    }
    return parseResult;
  })()
    .then(TaskOK)
    .catch(TaskError);
}
