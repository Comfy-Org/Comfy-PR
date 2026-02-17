import { readFile, writeFile } from "fs/promises";
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

export async function makeGpl3LicenseBranch(upstreamUrl: string, forkUrl: Readonly<string>) {
  const type = "gpl3-license" as const;

  const upstreamRepo = parseGithubRepoUrl(upstreamUrl);

  // Check if the repo already has a license — skip if it does
  const existingLicense = await gh.licenses
    .getForRepo({ owner: upstreamRepo.owner, repo: upstreamRepo.repo })
    .catch(() => null);
  if (existingLicense) {
    console.log("Skip: license already exists for " + upstreamUrl);
    return null;
  }

  const origin = await stringifyGithubOrigin(parseGithubRepoUrl(forkUrl));
  const branch = "gpl3-license";
  const tmpl = await readFile("./templates/add-gpl3-license.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = parseGithubRepoUrl(origin);

  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    // prevent unrelated history
    console.log("Skip changes as branch existed: " + branch);
    return { type, title, body, branch };
  }

  // Fetch canonical GPL-3.0 text from GitHub API
  const licenseData = await gh.licenses.get({ license: "gpl-3.0" });
  const licenseText = licenseData.data.body;

  const cwd = await getBranchWorkingDir(upstreamUrl, forkUrl, branch);

  // Clone the repo
  await $`git clone --single-branch ${upstreamUrl} ${cwd}`;

  // Write LICENSE file via Node.js to avoid shell escaping issues with license text
  await writeFile(`${cwd}/LICENSE`, licenseText, "utf8");

  // commit & push changes
  await $`
cd ${cwd}

git config user.name ${GIT_USERNAME} && \
git config user.email ${GIT_USEREMAIL} && \
git checkout -b ${branch} && \
git add LICENSE && \
git commit -m "chore(${branch}): ${title}" && \
git push -f "${origin}" ${branch}:${branch}
`;

  const branchUrl = `${stringifyGithubRepoUrl(repo)}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { type, title, body, branch };
}
