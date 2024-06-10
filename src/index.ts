#!/usr/bin/env bun

import { $ as bunSh, serve, sleep } from "bun";
import "dotenv/config";
import { os, question, updateArgv, $ as zx } from "zx";
import DIE from "@snomiao/die";
import { gh } from "./gh";
import { F, groupBy } from "rambda";
import updateCNRepos, { CNRepos, scanCNRepoThenPRs } from "./CNRepos";

zx.verbose = true;

// read env/parameters
console.log("Fetch Current Github User...");
export const user = (await gh.users.getAuthenticated()).data;
export const GIT_USERNAME =
  process.env.GIT_USERNAME ||
  (user.email && user.name) ||
  (await question("Input env.GIT_USERNAME: ")) ||
  DIE("Missing env.GIT_USERNAME");
export const GIT_USEREMAIL =
  process.env.GIT_USEREMAIL ||
  (user.email && user.email) ||
  (await question("Input env.GIT_USEREMAIL: ")) ||
  DIE("Missing env.GIT_USEREMAIL");
export const FORK_OWNER =
  process.env.FORK_OWNER?.replace(/"/g, "")?.trim() ||
  user.name ||
  (await question(
    "Input env.FORK_OWNER (for example FORK_OWNER=ComfyNodePRs, will fork into https://github.com/ComfyNodePRs): "
  )) ||
  DIE("Missing env.FORK_OWNER");
export const FORK_PREFIX =
  (process.env.FORK_PREFIX?.replace(/"/g, "")?.trim() ||
    (await question(
      "Input env.FORK_PREFIX ('PR-' is Recommened, but also it could be empty): "
    ))) ??
  DIE('Missing env.FORK_PREFIX, if you want empty maybe try FORK_PREFIX=""');

console.log(`GIT_USER: ${GIT_USERNAME} <${GIT_USEREMAIL}>`);

export async function checkComfyActivated() {
  console.log("Checking ComfyUI Activated...");
  const platform = os.platform();
  console.log("Platform: ", platform);
  const activate =
    platform === "win32"
      ? ".venv\\Scripts\\activate"
      : "source .venv/bin/activate";
  if (!(await bunSh`comfy --help`.quiet().catch(() => null))) {
    console.log('fail')
    DIE(
      `
Cound not found comfy-cli.
Please install comfy-cli before run "bunx comfy-pr" here.

$ >>>>>>>>>>>>>>>>>>>>>>>>>>
apt install -y python3-venv
python -m venv .venv
${activate}
pip install comfy-cli
comfy-cli --help
`.trim()
    );
  }
}
if (import.meta.main) {
  serve({
    port: 80,
    fetch(req) {
      return new Response("pong");
    },
  });

  await checkComfyActivated();
  // src/CNRepos

  await updateCNRepos();

  // updateCNReposPRTasks
  await scanCNRepoThenPRs();

  console.log("all done");
  await sleep(600e3); // 10min
  process.exit(0);
}
