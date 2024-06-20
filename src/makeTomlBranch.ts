import { readFile } from "fs/promises";
import { GIT_USEREMAIL } from "./GIT_USEREMAIL";
import { GIT_USERNAME } from "./GIT_USERNAME";
import { $ } from "./cli/echoBunShell";
import { getBranchWorkingDir } from "./getBranchWorkingDir";
import { gh } from "./gh";
import { parseUrlRepoOwner, stringifyGithubOrigin } from "./parseOwnerRepo";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";
import { tomlFillDescription } from "./tomlFillDescription";

export async function makePyprojectBranch(upstreamUrl: string, forkUrl: string) {
  const type = "pyproject" as const;
  const origin = await stringifyGithubOrigin(parseUrlRepoOwner(forkUrl));
  const branch = "pyproject";
  const tmpl = await readFile("./templates/add-toml.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = parseUrlRepoOwner(forkUrl);

  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    console.log("Skip changes as branch existed: " + branch);
    return { type, title, body, branch };
  }
  const src = parseUrlRepoOwner(upstreamUrl);
  const cwd = await getBranchWorkingDir(upstreamUrl, forkUrl, branch);

  // commit changes
  await $`
git clone ${upstreamUrl} ${cwd}

cd ${cwd}
echo N | comfy node init
`;

  // Try fill description from ComfyUI-manager
  const referenceUrl = `https://github.com/${src.owner}/${src.repo}`;
  const pyprojectToml = cwd + "/pyproject.toml";
  await tomlFillDescription(referenceUrl, pyprojectToml).catch((e) => {
    console.error(e);
  });

  await $`
cd ${cwd}
git config user.name ${GIT_USERNAME} && \
git config user.email ${GIT_USEREMAIL} && \
git checkout -b ${branch} && \
git add . && \
git commit -am ${`chore(${branch}): ${title}`} && \
git push "${origin}" ${branch}:${branch}
`;
  const branchUrl = `https://github.com/${repo.owner}/${repo.repo}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { type, title, body, branch };
}
