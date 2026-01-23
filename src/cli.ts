#!/usr/bin/env bun
import DIE from "@snomiao/die";
import { readFile } from "fs/promises";
import { argv, $ as zx } from "zx";
import { checkComfyActivated } from "./checkComfyActivated";
import { createComfyRegistryPullRequests } from "./createComfyRegistryPullRequests";
zx.verbose = true;

if (argv.help) {
  console.log(
    `
  bunx comfy-pr --repolist repos.txt       one repo per-line
  bunx comfy-pr [...GITHUB_REPO_URLS]      github repos
  bunx cross-env REPO=https://github.com/OWNER/REPO bunx comfy-pr
    `.trim(),
  );
}

{
  await checkComfyActivated();

  const envRepos =
    process.env.REPO?.split("\n")
      .map((e) => e.trim())
      .filter(Boolean) || [];
  const argvRepos = argv._.filter((a) => !a.endsWith(import.meta.filename));
  const listRepos =
    (argv.repolist &&
      (await readFile(argv.repolist, "utf8").catch(() => ""))
        .split("\n")
        .map((e) => e.trim())
        .filter(Boolean)) ||
    [];
  const repos = (listRepos.length && listRepos) ||
    (argvRepos.length && argvRepos) ||
    (envRepos.length && envRepos) || [DIE("Missing PR target, please set env.REPO")];
  for await (const upstreamUrl of repos) {
    await createComfyRegistryPullRequests(upstreamUrl);
  }
}
