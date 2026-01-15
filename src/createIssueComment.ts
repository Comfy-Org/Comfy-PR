import DIE from "@snomiao/die";
import { gh } from "@/lib/github";
import { ghUser } from "./ghUser";
import { parseIssueUrl } from "./parseIssueUrl";

if (import.meta.main) {
  // const url = "https://github.com/snomiao/ComfyNode-Registry-test/pull/1";
  // const body = "Hello World @snomiao";
  // const result = await createIssueComment(url, body, (await ghUser()).login);
  // console.log(result.comment.html_url);
  // console.log(result.comments.map((e) => e.html_url));
  const url = "https://github.com/snomiao/ComfyNode-Registry-test/pull/28";
  const body = "Hello World @robinjhuang";
  const result = await createIssueComment(url, body, (await ghUser()).login);
  console.log(result.comment.html_url);
  console.log(result.comments.map((e) => e.html_url));
}

export async function createIssueComment(issueUrl: string, body: string, by: string) {
  const comments = (
    await gh.issues.listComments({
      ...parseIssueUrl(issueUrl),
    })
  ).data;
  const result = await (async function () {
    const commentExisted = comments.find((e) => e.body === body);
    if (commentExisted) return { comment: commentExisted, comments };
    if (by !== (await ghUser()).login) DIE("Fails to creating issue: user not match");
    const comment = (await gh.issues.createComment({ ...parseIssueUrl(issueUrl), body })).data;
    console.log("+ IssueComment " + comment.html_url);
    return { comment, comments: [...comments, comment] };
  })();
  return result;
}
