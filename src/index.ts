#!/usr/bin/env bun
import "dotenv/config";
import { $ as zx } from "zx";
import { checkComfyActivated } from "./checkComfyActivated";
import { initializeFollowRules } from "./initializeFollowRules";
import { updateCNRepos } from "./updateCNRepos";
import { runFollowRuleSet } from "./updateFollowRuleSet";
import { updateSlackMessages } from "./updateSlackMessages";
import { tLog } from "./utils/tLog";

if (import.meta.main) {
  zx.verbose = true;
  await Promise.all([
    // try send msgs that didn't send in last run
    updateSlackMessages(),
    checkComfyActivated(), // needed if make pr
    updateCNRepos(),
  ]);
  await initializeFollowRules(), await tLog("runFollowRuleSet", runFollowRuleSet);
  console.log("All done");
  process.exit(0);
}
