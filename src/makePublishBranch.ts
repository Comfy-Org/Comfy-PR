import { readFile } from "fs/promises";
import { dirname } from "path";
import { GIT_USEREMAIL, GIT_USERNAME } from ".";
import { $ } from "./echoBunShell";
import { getBranchWorkingDir } from "./getBranchWorkingDir";
import { gh } from "./gh";
import {
  parseUrlRepoOwner,
  stringifyGithubOrigin,
  stringifyGithubRepoUrl,
} from "./parseOwnerRepo";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";

/**
 * Clone from upstream
 * push to fork url
 * @param dir
 * @param upstreamUrl
 * @param origin
 * @returns
 */
export async function makePublishcrBranch(
  upstreamUrl: string,
  forkUrl: Readonly<string>,
) {
  const type = "publishcr" as const;

  const origin = await stringifyGithubOrigin(parseUrlRepoOwner(forkUrl));
  const branch = "publish";
  const tmpl = await readFile("./templates/add-action.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = parseUrlRepoOwner(origin);

  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    console.log("Skip changes as branch existed: " + branch);
    return { type, title, body, branch };
  }

  const cwd = await getBranchWorkingDir(upstreamUrl, forkUrl, branch);

  const file = `${cwd}/.github/workflows/publish.yml`;
  const publishYmlPath = "./templates/publish.yaml";

  // commit & push changes
  await $`
git clone ${upstreamUrl} ${cwd}

mkdir -p ${dirname(file)}
cat ${publishYmlPath} > ${file}

cd ${cwd}

git config user.name ${GIT_USERNAME} && \
git config user.email ${GIT_USEREMAIL} && \
git checkout -b ${branch} && \
git add . && \ 
git commit -am "chore(${branch}): ${title}" && \
git push "${origin}" ${branch}:${branch}
    `;

  const branchUrl = `${stringifyGithubRepoUrl(repo)}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { type, title, body, branch };
}
