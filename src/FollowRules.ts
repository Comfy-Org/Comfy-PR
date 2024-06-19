import { z } from "zod";
import type { PullsStatus } from "./analyzePullsStatus";
import { db } from "./db";
import type { zFollowUpRules } from "./followRuleSchema";
import { type Task } from "./utils/Task";

const zFollowRule = z.object({
  name: z.string().min(3).max(255),
  yaml: z.string(),
  // rules: z.object<>({} ).passthrough(),

  enabled: z.boolean().optional(),
});

// migrate data
await db.renameCollection("FollowRules", "FollowRuleSets").catch(()=>null)
export type FollowRule = z.infer<typeof zFollowUpRules>[number]
export type FollowRuleSet = z.infer<typeof zFollowRule> & {
  rules?: Task<FollowRule[]>;
  matched?: Task<PullsStatus>;
  action_results?: {
    name: string;
    action: any;
    result: Task<any>;
  }[];
};
export const FollowRuleSets = db.collection<
FollowRuleSet
>("FollowRuleSets");
await FollowRuleSets.createIndex("name", { unique: true });
