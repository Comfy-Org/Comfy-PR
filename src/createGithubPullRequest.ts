import DIE from "@snomiao/die";
import yaml from "yaml";
import { chalk } from "zx";
import type { GithubPull } from "./fetchRepoPRs";
import { gh } from "./gh";
import { parseRepoUrl } from "./parseOwnerRepo";

export async function createGithubPullRequest({
  title, body, branch, srcUrl, dstUrl,
}: {
  title: string;
  body: string;
  branch: string;
  srcUrl: string;
  dstUrl: string;
}) {
  const dst = parseRepoUrl(dstUrl);
  const src = parseRepoUrl(srcUrl);
  const repo = (await gh.repos.get({ ...dst })).data;

  // TODO: seems has bugs on head_repo
  const existedList = (
    await gh.pulls.list({
      // source repo
      state: "all",
      head_repo: src.owner + "/" + src.repo,
      head: src.owner + ":" + branch,
      // pr will merge into
      owner: dst.owner,
      repo: dst.repo,
      base: repo.default_branch,
    })
  ).data;
  if (existedList.length) {
    const msg = {
      PR_Existed: existedList.map((e) => ({ url: e.html_url, title: e.title })),
    };
    console.log(chalk.red(yaml.stringify(msg)));
    return existedList[0];
  }
  if (!process.env.GH_TOKEN_COMFY_PR) {
    DIE("Missing env.GH_TOKEN_COMFY_PR");
  }
  const pr_result = await gh.pulls
    .create({
      // pr info
      title,
      body,
      // source repo
      head_repo: src.owner + "/" + src.repo,
      head: src.owner + ":" + branch,
      // pr will merge into
      owner: dst.owner,
      repo: dst.repo,
      base: repo.default_branch,
      maintainer_can_modify: true,
      // draft: true,
    })
    .then((e) => e.data)
    .catch(async (e) => {
      if (e.message.match("A pull request already exists for")) {
        console.log("PR Existed ", e);
        // WARN: will search all prs
        const existedList = (
          await gh.pulls.list({
            // source repo
            state: "open",
            head_repo: src.owner + "/" + src.repo,
            // head: src.owner + ":" + branch,
            // pr will merge into
            owner: dst.owner,
            repo: dst.repo,
            base: repo.default_branch,
          })
        ).data;
        if (existedList.length) {
          const msg = {
            PR_Existed: existedList.map((e) => ({
              url: e.html_url,
              title: e.title,
            })),
          };
          console.log(chalk.red(yaml.stringify(msg)));
          return existedList[0];
        }
      }
      throw e;
    });
  console.log("PR OK", pr_result.html_url);
  return pr_result as GithubPull;
}
