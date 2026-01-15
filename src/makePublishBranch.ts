import { readFile } from "fs/promises";
import { dirname } from "path";
import { $ } from "./cli/echoBunShell";
import { getBranchWorkingDir } from "./getBranchWorkingDir";
import { gh } from "@/lib/github";
import { GIT_USEREMAIL, GIT_USERNAME } from "./ghUser";
import {
  parseGithubRepoUrl,
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
export async function makePublishcrBranch(upstreamUrl: string, forkUrl: Readonly<string>) {
  const type = "publishcr" as const;

  const origin = await stringifyGithubOrigin(parseGithubRepoUrl(forkUrl));
  const branch = "publish";
  const tmpl = await readFile("./templates/add-action.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = parseGithubRepoUrl(origin);

  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    // prevent unrelated history
    console.log("Skip changes as branch existed: " + branch);
    return { type, title, body, branch };
  }

  const cwd = await getBranchWorkingDir(upstreamUrl, forkUrl, branch);
  const upsreamOwner = parseGithubRepoUrl(upstreamUrl).owner;
  const file = `.github/workflows/publish.yml`;
  const publishYmlPath = "./templates/publish.yaml";
  const publishYmlTemplate = await readFile(publishYmlPath, "utf8");
  const repalcedContent = publishYmlTemplate.replace("NODE_AUTHOR_OWNER", upsreamOwner);
  if (publishYmlTemplate === repalcedContent) throw new Error("fail to replace NODE_AUTHOR_OWNER");
  // commit & push changes
  await $`
git clone --single-branch ${upstreamUrl} ${cwd}

cd ${cwd}

mkdir -p ${dirname(file)}
echo "${repalcedContent}" > ${file}

git config user.name ${GIT_USERNAME} && \
git config user.email ${GIT_USEREMAIL} && \
git checkout -b ${branch} && \
git add . && \ 
git commit -am "chore(${branch}): ${title}" && \
git push -f "${origin}" ${branch}:${branch}
`;

  const branchUrl = `${stringifyGithubRepoUrl(repo)}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { type, title, body, branch };
}
