import { gh } from "./gh";
import { repoUrlParse } from "./parseOwnerRepo";
import { ghRepoStringify } from "./parseOwnerRepo";
import { user } from ".";

export async function ghFork(from: string, to: string) {
  const _to = repoUrlParse(to);
  const forkResult = await gh.repos
    .createFork({
      ...(user.name !== _to.owner && { organization: _to.owner }),
      name: _to.repo,
      ...repoUrlParse(from),
    })
    .catch((e) => {
      if (e.message.match("Name already exists on this account")) return null;
      throw e;
    });
  const forkedUrl = forkResult?.data.html_url ?? ghRepoStringify(_to);
  console.log("FORK OK ", forkedUrl);
}
