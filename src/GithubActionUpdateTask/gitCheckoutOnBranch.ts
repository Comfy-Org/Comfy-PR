import { mkdir } from "fs/promises";
import { $ } from "../cli/echoBunShell";
import { GIT_USEREMAIL, GIT_USERNAME } from "../ghUser";

export async function gitCheckoutOnBranch({
  url,
  cwd,
  branch,
}: {
  url: string;
  cwd: string;
  branch: string;
}) {
  await mkdir(cwd, { recursive: true });
  await $`
git clone --single-branch ${url} ${cwd}
cd ${cwd}
git config user.name ${await GIT_USERNAME()} && \
git config user.email ${await GIT_USEREMAIL()} && \
git checkout -b ${branch}
`;
  console.log("checkout", JSON.stringify({ cwd }));
  return cwd;
}
