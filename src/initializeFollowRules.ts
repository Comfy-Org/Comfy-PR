import DIE from "@snomiao/die";
import { readFile } from "fs/promises";
import { FollowRuleSets } from "./FollowRules";
import { createLogger } from "./logger";

const logger = createLogger("initializeFollowRules");

if (import.meta.main) {
  const followRules = await initializeFollowRules();
  const ruleset =
    (await FollowRuleSets.findOne({ name: "default" })) ?? DIE("default ruleset not found");
  if (!ruleset?.enabled) DIE("default ruleset not enabled");

  logger.info("initialized follow rules");
}
/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export async function initializeFollowRules() {
  return await updateFollowRules(
    "default",
    await readFile("./templates/follow-rules.yaml", "utf8"),
  );
}

export async function updateFollowRules(name: string, rawRuleYaml: string) {
  return (await FollowRuleSets.findOneAndUpdate(
    { name },
    { $setOnInsert: { yaml: rawRuleYaml, enabled: false } },
    { upsert: true, returnDocument: "after" },
  ))!;
}
