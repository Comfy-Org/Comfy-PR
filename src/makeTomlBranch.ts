import DIE from "@snomiao/die";
import { readFile, writeFile } from "fs/promises";
import toml from "toml";
import { $ } from "./cli/echoBunShell";
import { fetchRepoDescriptionMap } from "./fetchRepoDescriptionMap";
import { getBranchWorkingDir } from "./getBranchWorkingDir";
import { gh } from "@/lib/github";
import { GIT_USEREMAIL, GIT_USERNAME } from "./ghUser";
import { parseGithubRepoUrl, stringifyGithubOrigin } from "./parseOwnerRepo";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";

export async function makePyprojectBranch(upstreamUrl: string, forkUrl: string) {
  const type = "pyproject" as const;
  const origin = await stringifyGithubOrigin(parseGithubRepoUrl(forkUrl));
  const branch = "pyproject";
  const tmpl = await readFile("./templates/add-toml.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = parseGithubRepoUrl(forkUrl);

  const existingBranch = await gh.repos.getBranch({ ...repo, branch }).catch(() => null);
  if (existingBranch) {
    console.log("Branch exists, checking if outdated: " + branch);

    // Get upstream HEAD commit
    const upstreamRepo = parseGithubRepoUrl(upstreamUrl);
    const upstreamRepoInfo = await gh.repos.get(upstreamRepo);
    const defaultBranch = upstreamRepoInfo.data.default_branch;
    const upstreamHead = await gh.repos.getBranch({ ...upstreamRepo, branch: defaultBranch });

    // Get the base commit of the existing branch
    const branchBaseCommit = existingBranch.data.commit.sha;
    const upstreamHeadCommit = upstreamHead.data.commit.sha;

    // Check if branch is outdated (base commit differs from upstream HEAD)
    if (branchBaseCommit === upstreamHeadCommit) {
      console.log("Branch is up to date, skipping: " + branch);
      return { type, title, body, branch };
    }

    console.log("Branch is outdated, recreating and force-pushing: " + branch);
    // Continue with the branch creation logic below (will force-push)
  }
  const src = parseGithubRepoUrl(upstreamUrl);
  const cwd = await getBranchWorkingDir(upstreamUrl, forkUrl, branch);

  // commit changes
  await $`
git clone --single-branch ${upstreamUrl} ${cwd}

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
git push ${existingBranch ? "--force" : ""} "${origin}" ${branch}:${branch}
`;
  const branchUrl = `https://github.com/${repo.owner}/${repo.repo}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { type, title, body, branch };
}

async function tomlFillDescription(referenceUrl: string, pyprojectToml: string) {
  const repoDescriptionMap = await fetchRepoDescriptionMap();
  const matchedDescription =
    repoDescriptionMap[referenceUrl]?.toString() ||
    DIE("Warn: missing description for " + referenceUrl);
  const replaced = (await readFile(pyprojectToml, "utf8")).replace(
    `description = ""`,
    `description = ${JSON.stringify(matchedDescription)}`,
  );
  // check validity
  toml.parse(replaced);
  await writeFile(pyprojectToml, replaced);
}
