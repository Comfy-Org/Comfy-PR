import { readFile } from "fs/promises";
import { dirname } from "path";
import { $ } from "./echoBunShell";
import { gh } from "./gh";
import { ghRepoStringify, repoUrlParse } from "./parseOwnerRepo";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";
import { GIT_USERNAME, GIT_USEREMAIL } from ".";

export async function pushBranchPublish(dir: string, upstreamUrl: string, forkUrl: string) {
  const branch = "publish";
  const tmpl = await readFile("./templates/add-action.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = repoUrlParse(forkUrl);

  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    console.log("Skip changes as branch existed: " + branch);
    return { title, body, branch };
  }

  const src = repoUrlParse(upstreamUrl);
  const cwd = `${dir}/${branch}/${src.repo}`; // src.repo is for keep correct directory name

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
git push "${forkUrl}" ${branch}:${branch}
    `;

  const branchUrl = `${ghRepoStringify(repo)}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { title, body, branch };
}
