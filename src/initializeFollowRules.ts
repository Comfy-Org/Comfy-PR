import { analyzePullsStatusPipeline } from "@/src/analyzePullsStatus";
import DIE from "@snomiao/die";
import { readFile } from "fs/promises";
import pMap from "p-map";
import { peekYaml } from "peek-log";
import promiseAllProperties from "promise-all-properties";
import yaml from "yaml";
import { z } from "zod";
import { FollowRuleSets } from "./FollowRules";
import { zFollowUpRules } from "./followRuleSchema";
import { $OK, TaskError, TaskOK } from "./utils/Task";
import { tsmatch } from "./utils/tsmatch";

if (import.meta.main) {
  const followRules = await initializeFollowRules();
  // await peekYaml(FollowRules.find({}).toArray())
  const results = peekYaml(
    await pMap(
      tsmatch(followRules.rules)
        .with($OK, ({ data }) => data)
        .otherwise(() => null) ?? [],
      async ({ name, $match, action }) =>
        promiseAllProperties({
          name,
          $match,
          // action: "",
          matched: analyzePullsStatusPipeline()
            .match($match)
            .count("total")
            .aggregate()
            .next()
            .then((x) => x?.total ?? 0),
          sample_action: (async function () {
            const payload = (await analyzePullsStatusPipeline()
              .match($match)
              .limit(20)
              .sample({ size: 1 })
              .aggregate()
              .next())!;
            if (!payload) return;
            return yaml.parse(
              yaml
                .stringify(action)
                .replace(/{{\$(\w+)}}/, (_, key: string) => (payload as any)[key] || DIE("missing key: " + key)),
            );
          })(),
        }),
      { concurrency: 1 },
    ),
  );
  console.log("initialized follow rules");
}
/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export async function initializeFollowRules() {
  return await updateFollowRules("default", await readFile("./templates/follow-rules.yaml", "utf8"));
}
export async function updateFollowRules(name: string, rawRuleYaml: string) {
  const rawRules = z.array(z.any()).parse(yaml.parse(rawRuleYaml));
  const rules = await zFollowUpRules.parseAsync(rawRules).then(TaskOK).catch(TaskError);
  return (await FollowRuleSets.findOneAndUpdate(
    { name },
    { $setOnInsert: { yaml: rawRuleYaml, rules, enabled: false } },
    { upsert: true, returnDocument: "after" },
  ))!;
}
