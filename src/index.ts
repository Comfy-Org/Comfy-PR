#!/usr/bin/env bun
import "dotenv/config";
import { $ as zx } from "zx";
import { checkComfyActivated } from "./checkComfyActivated";
import { initializeFollowRules } from "./initializeFollowRules";
import { updateCNRepos } from "./updateCNRepos";
import { runFollowRuleSet } from "./updateFollowRuleSet";
import { updateSlackMessages } from "./updateSlackMessages";

if (import.meta.main) {
  zx.verbose = true;
  await Promise.all([
    // try send msgs that didn't send in last run
    updateSlackMessages(),
    checkComfyActivated(), // needed if make pr
    initializeFollowRules(),
    runFollowRuleSet(),
    updateCNRepos(),
  ]);
  console.log("All done");
  process.exit(0);
}
