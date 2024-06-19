import { FollowRuleSets } from "@/src/FollowRules";
import { analyzePullsStatusPipeline, type PullStatus } from "@/src/analyzePullsStatus";
import { zFollowUpRules } from "@/src/followRuleSchema";
import { $ERROR, $OK, TaskError, TaskOK } from "@/src/utils/Task";
import { tsmatch } from "@/src/utils/tsmatch";
import { yaml } from "@/src/utils/yaml";
import { revalidatePath } from "next/cache";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import pMap from "p-map";
import prettyMs from "pretty-ms";
import Markdown from "react-markdown";
const RuleWhirler = dynamic(() => import("./RuleWhirler"), { ssr: false });
export default async function FollowRulesPage({ params: { name = "default" } }) {
  const followRuleSet = (await FollowRuleSets.findOne({ name })) ?? notFound();
  const defaultYaml = followRuleSet.yaml;
  // const defaultRules = TaskDataOrNull(followRuleSet.rules);
  const enabled = followRuleSet.enabled;
  if (enabled) {
    // nothing but a disable button
    return (
      <main className="grow card-body gap-4">
        <h2>Follow Up rules</h2>
        <div className="card">
          <button
            onClick={async () => {
              "use server";
              await FollowRuleSets.updateOne({ name }, { $set: { enabled: false } });
              revalidatePath("/rules/" + name);
              revalidatePath("/rules");
            }}
            className="btn btn-error"
          >
            Disable Ruleset
          </button>

          <Markdown>
            {`
## Ruleset is enabled

${"```yaml"}
${defaultYaml}
${"```"}
`}
          </Markdown>
        </div>
      </main>
    );
  }
  return (
    <main className="grow card-body gap-4">
      <h1>Follow Up Rules (editor)</h1>
      <div className="card">
        <RuleWhirler
          matchAll={async (code) => {
            "use server";
            const rulesTask = await zFollowUpRules.parseAsync(yaml.parse(code)).then(TaskOK).catch(TaskError);
            return tsmatch(rulesTask)
              .with($ERROR, ({ error }) => TaskError(error))
              .with($OK, async ({ data }) => {
                // save if parse succ
                const rules = data;
                await FollowRuleSets.updateOne({ name }, { $set: { yaml: code, rules: rulesTask } });
                return await pMap(rules, async (rule) => {
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
                  return { name: rule.name, matched };
                })
                  .then(TaskOK)
                  .catch(TaskError);
              })
              .otherwise(() => TaskError("Unknown status"));
          }}
          defaultYaml={defaultYaml}
        />
      </div>
    </main>
  );
}
