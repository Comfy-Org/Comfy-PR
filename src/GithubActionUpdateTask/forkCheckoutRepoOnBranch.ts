import { createGithubForkForRepoEx } from "../createGithubForkForRepo";
import { getBranchWorkingDir } from "../getBranchWorkingDir";
import { gitCheckoutOnBranch } from "./gitCheckoutOnBranch";

export async function forkCheckoutRepoOnBranch(upstreamUrl: string, branch: string) {
  console.log("==== CHECKOUT " + upstreamUrl);
  const forkedRepo = await createGithubForkForRepoEx(upstreamUrl);
  const forkedHtmlUrl = forkedRepo.html_url;
  const cwd = await getBranchWorkingDir(upstreamUrl, forkedRepo.html_url, branch);
  await gitCheckoutOnBranch({ url: upstreamUrl, cwd, branch });
  return { cwd, html_url: forkedHtmlUrl };
}
