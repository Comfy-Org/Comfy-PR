import { z } from "zod";
import type { PullsStatus } from "./analyzePullsStatus";
import { db } from "./db";
import type { zFollowUpRules } from "./followRuleSchema";
import { type Task } from "./utils/Task";

// migrate data
// await db.renameCollection("FollowRules", "FollowRuleSets").catch(() => null);
export type FollowRule = z.infer<typeof zFollowUpRules>[number];
export type FollowRuleSet = {
  // rules?: Task<FollowRule[]>;
  name: string;
  yaml: string;
  rules?: FollowRule[];
  matched?: Task<PullsStatus>;
  action_results?: {
    name: string;
    action: any;
    result: Task<any>;
  }[];
  enabled?: boolean;
  yamlWhenEnabled?: string;
};
export const FollowRuleSets = db.collection<FollowRuleSet>("FollowRuleSets");
await FollowRuleSets.createIndex("name", { unique: true });
