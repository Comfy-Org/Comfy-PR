import { readFile } from "fs/promises";
import { $ } from "./echoBunShell";
import { gh } from "./gh";
import { repoUrlParse } from "./parseOwnerRepo";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";
import { tomlFillDescription } from "./tomlFillDescription";
import { GIT_USERNAME, GIT_USEREMAIL } from ".";

export async function pushTomlBranch(
  dir: string,
  upstreamUrl: string,
  forkUrl: string
) {
  const branch = "pyproject";
  const tmpl = await readFile("./templates/add-toml.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = repoUrlParse(forkUrl);

  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    console.log("Skip changes as branch existed: " + branch);
    return { title, body, branch };
  }

  const src = repoUrlParse(upstreamUrl);
  const cwd = `${dir}/${branch}/${src.repo}`; // src.repo is for keep correct directory name

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
git push "${forkUrl}" ${branch}:${branch}
`;
  const branchUrl = `https://github.com/${repo.owner}/${repo.repo}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { title, body, branch };
}
