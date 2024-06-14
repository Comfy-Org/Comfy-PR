import { gh } from "./gh";
import { parseUrlRepoOwner } from "./parseOwnerRepo";


export async function fetchPullComments(
  repo: string,
  pull: { number: number; }
) {
  const result = (
    await gh.issues.listComments({
      ...parseUrlRepoOwner(repo),
      issue_number: pull.number,
      direction: "asc",
      sort: "created",
    })
  ).data;
  console.log(
    `[INFO] fetchd Pull Comments (${result.length}) from ${repo} #${pull.number}`
  );
  return result;
}
