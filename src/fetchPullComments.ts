import { gh } from "./gh";
import { parseUrlRepoOwner } from "./parseOwnerRepo";


export async function fetchIssueComments(
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
    `[INFO] Fetchd ${result.length} Comments from ${repo}/pull/${pull.number}`
  );
  return result;
}
