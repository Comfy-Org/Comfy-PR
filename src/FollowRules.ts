import { z } from "zod";
import { type Task } from "../packages/mongodb-pipeline-ts/Task";
import type { PullsStatus } from "./analyzePullsStatus";
import { db } from "./db";
import type { zFollowUpRules } from "./followRuleSchema";

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
    action: unknown;
    result: Task<unknown>;
  }[];
  enabled?: boolean;
  yamlWhenEnabled?: string;
};
export const FollowRuleSets = db.collection<FollowRuleSet>("FollowRuleSets");
FollowRuleSets.createIndex("name", { unique: true }).catch(() => null);
