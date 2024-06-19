import { FollowRuleSets } from "@/src/FollowRules";
import type { ReactNode } from "react";
import Markdown from "react-markdown";
import { TaskDataOrNull } from "./TaskDataOrNull";
export default async function RulesLayout({ children }: { children: ReactNode }) {
  const frs = await FollowRuleSets.find({}).toArray();
  return (
    <div className="flex flex-wrap">
      <div className="card-body w-40">
        <h2>Action RuleSets</h2>
        <div className="card">
          <ul>
            {frs.map((e) => {
              return (
                <li key={e.name}>
                  [{e.enabled ? "ENABLED" : "DISABLED"}]
                  {`${e.name}: (${TaskDataOrNull(e.rules)?.length ?? "FAIL to parsed"} rules, matched ${TaskDataOrNull(e.matched)?.length} prs, performed ${e.action_results?.map((r) => TaskDataOrNull(r.result).length).join("/") ?? "NO"} actions)`}
                  <Markdown>{`[[EDIT](/rules/${e.name})]`}</Markdown>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
