import "dotenv/config";
import { checkComfyActivated } from "./checkComfyActivated";
import { updateEmailTasks } from "./EmailTasks";
import { initializeFollowRules } from "./initializeFollowRules";
import { updateAuthors } from "./updateAuthors";
import { updateCNRepos } from "./updateCNRepos";
import { runFollowRuleSet } from "./updateFollowRuleSet";
import { updateSlackMessages } from "./updateSlackMessages";
import { tLog } from "./utils/tLog";

if (import.meta.main) {
  await Promise.all([
    // try send msgs that didn't send in last run
    updateSlackMessages(),
    checkComfyActivated(), // needed if make pr
    updateCNRepos(),
    updateAuthors(),
    updateEmailTasks(),
  ]);
  await initializeFollowRules();
  await tLog("runFollowRuleSet", runFollowRuleSet);
  console.log("All done");
  process.exit(0);
}
