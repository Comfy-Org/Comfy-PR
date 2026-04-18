import { TaskDataOrNull } from "@/packages/mongodb-pipeline-ts/Task";
import { FollowRuleSets } from "@/src/FollowRules";
import Link from "next/link";
import Markdown from "react-markdown";
export const dynamic = "force-dynamic";
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
            {(followRuleSets as unknown as Array<Record<string, unknown>>).map((e) => {
              return (
                <li key={e.name as string} className="card-body">
                  [{e.enabled ? "ENABLED" : "DISABLED"}]
                  {`${e.name}: (${
                    (e.rules as unknown[])?.length ?? "FAIL to parse"
                  } rules, matched ${(TaskDataOrNull(e.matched as Parameters<typeof TaskDataOrNull>[0]) as Record<string, unknown>)?.length} prs, performed ${(e.action_results as unknown[])?.map((r: unknown) => (TaskDataOrNull((r as Record<string, unknown>).result as Parameters<typeof TaskDataOrNull>[0]) as Record<string, unknown>).length).join("/") ?? "NO"} actions)`}
                  <Link className="btn" href={`/rules/${e.name}`}>
                    [Edit]
                  </Link>
                </li>
              );
            })}
          </ul>
          <Markdown>{`
1. [Grant Gmail sender permissions](/followup/actions/send-gmail)
1. [Default rule](/rules/default)
`}</Markdown>
        </div>
        <a href="https://github.com/drip-art/Comfy-Registry-PR/blob/main/app/(dashboard)/rules/page.tsx">
          Edit this page
        </a>
      </div>
    </div>
  );
}
