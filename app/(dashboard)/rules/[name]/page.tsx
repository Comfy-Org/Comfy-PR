import { FollowRuleSets } from "@/src/FollowRules";
import { zFollowUpRules } from "@/src/followRuleSchema";
import { TaskError, TaskOK } from "@/src/utils/Task";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
const RuleWhirler = dynamic(() => import("./RuleWhirler"), { ssr: false });
export default async function FollowRulesPage({ params: { name = "default" } }) {
  const defaultValue = (await FollowRuleSets.findOne({ name }))?.yaml ?? notFound();
  return (
    <main>
      <h1>Follow Rules Edit</h1>
      <div className="card-body">
        <RuleWhirler
          onChange={async (yaml) => {
            "use server";
            // update rules by yaml
            console.log({ yaml });
            return await zFollowUpRules.parseAsync(yaml).then(TaskOK).catch(TaskError);
          }}
          defaultValue={defaultValue}
        />
      </div>
    </main>
  );
}
// workflow:
// client: Edit follow-rules.yaml on left
// server: zod validating, scan documents, get tasks summary, send back to client
// client: Review the realtime aggregate result on right.
// client: click enable to apply the rules
// server: execute the tasks, return the result in realtime
