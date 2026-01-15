import { gh } from ".";
import { ghUser } from "@/src/ghUser";
import { parseGithubRepoUrl, stringifyGithubRepoUrl } from "@/src/parseOwnerRepo";

if (import.meta.main) {
  const randomId = Math.random().toString(36).slice(2);
  console.log(
    await createGithubFork(
      "https://github.com/latenightlabs/ComfyUI-LNL",
      "https://github.com/ComfyNodePRs/PR-ComfyUI-LNL-" + randomId,
    ),
  );
}
export async function createGithubFork(from: string, to: string) {
  const _to = parseGithubRepoUrl(to);
  const _from = parseGithubRepoUrl(from);
  const forkResult = await gh.repos
    .createFork({
      // from owner repo
      ..._from,
      // to owner repo
      ...((await ghUser()).name !== _to.owner && { organization: _to.owner }),
      name: _to.repo,
    })
    .catch(async (e) => {
      if (e.message.match("Name already exists on this account"))
        return await gh.repos.get({ ..._to });
      throw e;
    });
  const forkedUrl = forkResult!.data.html_url ?? stringifyGithubRepoUrl(_to);
  console.log("FORK OK ", forkedUrl);
  return forkResult!.data;
}
