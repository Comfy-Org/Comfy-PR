import { gh } from "./gh";
import { parseRepoUrl } from "./parseOwnerRepo";


export async function fetchPullComments(
  repo: string,
  pull: { number: number; }
) {
  const result = (
    await gh.issues.listComments({
      ...parseRepoUrl(repo),
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
