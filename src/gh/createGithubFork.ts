import { gh } from ".";
import { ghUser } from "../ghUser";
import { parseUrlRepoOwner, stringifyGithubRepoUrl } from "../parseOwnerRepo";

export async function createGithubFork(from: string, to: string) {
  const _to = parseUrlRepoOwner(to);
  const forkResult = await gh.repos
    .createFork({
      ...(ghUser.name !== _to.owner && { organization: _to.owner }),
      name: _to.repo,
      ...parseUrlRepoOwner(from),
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
