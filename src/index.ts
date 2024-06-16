#!/usr/bin/env bun
import DIE from "@snomiao/die";
import "dotenv/config";
import { $ as zx } from "zx";
import { checkComfyActivated } from "./checkComfyActivated";
import { gh } from "./gh";
import { updateCNRepos } from "./updateCNRepos";

zx.verbose = true;

// read env/parameters
console.log("Fetch Current Github User...");
export const user = (await gh.users.getAuthenticated()).data;
console.log(`Current Github User: ${user.login} <${user.email}>`);
export const GIT_USERNAME = process.env.GIT_USERNAME || (user.email && user.name) || DIE("Missing env.GIT_USERNAME");
export const GIT_USEREMAIL =
  process.env.GIT_USEREMAIL || (user.email && user.email) || DIE("Missing env.GIT_USEREMAIL");
export const FORK_OWNER =
  process.env.FORK_OWNER?.replace(/"/g, "")?.trim() || user.login || DIE("Missing env.FORK_OWNER");
export const FORK_PREFIX =
  process.env.FORK_PREFIX?.replace(/"/g, "")?.trim() ||
  DIE('Missing env.FORK_PREFIX, if you want empty maybe try FORK_PREFIX=""');

console.log(`GIT COMMIT USER: ${GIT_USERNAME} <${GIT_USEREMAIL}>`);

if (import.meta.main) {
  await checkComfyActivated(); // needed if make pr
  await updateCNRepos();
  console.log("All done");
  process.exit(0);
}

export { checkComfyActivated, updateCNRepos };
