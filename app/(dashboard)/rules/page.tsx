import { FollowRuleSets } from "@/src/FollowRules";
import Link from "next/link";
import { TaskDataOrNull } from "./TaskDataOrNull";

/**
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function RulesList() {
  const followRuleSets = await FollowRuleSets.find({}).toArray();
  return (
    <div className="text-1xl self-center">
      <div className="card-body min-w-0 max-w-30 shrink">
        <h2>Follow-up RuleSets</h2>
        <div className="card">
          <ul>
            {followRuleSets.map((e) => {
              return (
                <li key={e.name} className="card-body">
                  [{e.enabled ? "ENABLED" : "DISABLED"}]
                  {`${e.name}: (${TaskDataOrNull(e.rules)?.length ?? "FAIL to parse"} rules, matched ${TaskDataOrNull(e.matched)?.length} prs, performed ${e.action_results?.map((r) => TaskDataOrNull(r.result).length).join("/") ?? "NO"} actions)`}
                  <Link className="btn" href={`/rules/${e.name}`}>
                    [Edit]
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
