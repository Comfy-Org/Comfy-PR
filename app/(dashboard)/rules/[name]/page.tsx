import { FollowRuleSets } from "@/src/FollowRules";
import { updateFollowRuleSet } from "@/src/updateFollowRuleSet";
import dynamicComponent from "next/dynamic";
import { notFound } from "next/navigation";
const RuleSetWhirler = dynamicComponent(() => import("./RuleSetWhirler"), { ssr: false });
export const dynamic = "force-dynamic";
export default async function FollowRulesPage({ params: { name = "default" } }) {
  const followRuleSet = (await FollowRuleSets.findOne({ name })) ?? notFound();
  const defaultYaml = followRuleSet.yaml;
  // const defaultRules = TaskDataOrNull(followRuleSet.rules);
  const enabled = followRuleSet.enabled;
  return (
    <main className="grow card-body gap-4">
      <h1>
        Follow Up ruleset ({name}) ({enabled ? "ENABLED" : "DISABLED"})
      </h1>
      <div className="card">
        <RuleSetWhirler
          name={name}
          updateFollowRuleSet={updateFollowRuleSet}
          defaultYaml={defaultYaml}
          defaultMatchResults={await updateFollowRuleSet({ yaml: defaultYaml, name })}
          enabled={enabled}
        />
      </div>
    </main>
  );
}
