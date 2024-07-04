"use server";
import DIE from "@snomiao/die";
import { FollowRuleSets } from "./FollowRules";
import { updateFollowRuleSet } from "./updateFollowRuleSet";

export async function showFollowRuleSet({ name = "default" } = {}) {
  const ruleset = (await FollowRuleSets.findOne({ name })) ?? DIE("default ruleset not found");
  return await updateFollowRuleSet({
    name: ruleset.name,
    yaml: ruleset.yamlWhenEnabled ?? DIE("Rule not enabled"),
  });
}
