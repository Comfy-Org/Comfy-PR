import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { CNRepos } from "@/src/CNRepos";
import { parseGithubRepoUrl, stringifyGithubRepoUrl } from "@/src/parseOwnerRepo";
import { mkdir, rmdir } from "fs/promises";
import isCI from "is-ci";
import sflow from "sflow";
import sha256 from "sha256";
import { $ } from "zx";
import { GithubContributorAnalyzeTask, GithubContributorAnalyzeTaskFilter } from "./GithubContributorAnalyzeTask";
import { parseGitShortLog } from "./parseGitShortLog";

if (import.meta.main) {
  await GithubContributorAnalyzeTask.createIndex({ repoUrl: 1 }, { unique: true });

  // import tasks
  await $pipeline(CNRepos)
    .project({ repoUrl: "$repository", _id: 0 })
    .match({ repoUrl: /^https:\/\/github\.com/ })
    .merge({
      into: GithubContributorAnalyzeTask.collectionName,
      on: "repoUrl",
      whenMatched: "merge",
    })
    .aggregate()
    .next();

  const remain = await GithubContributorAnalyzeTask.countDocuments(GithubContributorAnalyzeTaskFilter);
  const total = await GithubContributorAnalyzeTask.countDocuments();

  const notRetryableErrors = [
    "Repository not found",
    "repoUrl not match",
    "This repository exceeded its LFS budget. The account responsible for the budget should increase it to restore access.",
    "Access to this repository has been disabled by GitHub staff.",
  ];

  await sflow(
    GithubContributorAnalyzeTask.find({
      // data stale after 1day
      updatedAt: { $not: { $gt: new Date(Date.now() - 1000 * 60 * 60 * 24) } },
    }),
  )
    //filter out not retryable error
    .filter((e) => {
      if (e.error) {
        for (const error of notRetryableErrors) {
          if (e.error.match(error)) {
            console.log("filter out not retryable error", { repoUrl: e.repoUrl, error });
            return false;
          }
        }
      }
      return true;
    })
    .filter((e) => !e.error?.match("Repository not found")) //filter out not retryable error
    .filter((e) => !e.error?.match("repoUrl not match")) //filter out not retryable error
    .filter(
      (e) =>
        !e.error?.match(
          "This repository exceeded its LFS budget. The account responsible for the budget should increase it to restore access.",
        ),
    )
    .filter((e) => !e.error?.match("Access to this repository has been disabled by GitHub staff.")) //filter out not retryable error
    .pMap(
      async ({ _id, repoUrl }, index) => {
        console.log(`Task githubContributorAnalyze ${index}/${remain}/${total}`, { repoUrl });
        try {
          const ghurl = stringifyGithubRepoUrl(parseGithubRepoUrl(repoUrl));
          if (ghurl !== repoUrl) {
            console.log("repoUrl not match", { repoUrl, ghurl });
            throw new Error("repoUrl not match");
          }
          const result = await githubContributorAnalyze(repoUrl);

          await GithubContributorAnalyzeTask.updateOne({ repoUrl }, { $set: { ...result } }, { upsert: true });
          return result;
        } catch (e) {
          console.error("githubContributorAnalyze error", e);
          await GithubContributorAnalyzeTask.updateOne(
            { repoUrl },
            { $set: { errorAt: new Date(), error: String(e) } },
            { upsert: true },
          );
        }
      },
      { concurrency: 10 },
    )
    .log()
    .run();

  console.log("done");
  if (isCI) process.exit(0);
  // Array.prototype.groupBy = function <T, K extends keyof T>(key: K) {
  //   const arr = this;
  //   return Object.groupBy(arr, (e) => e[key]);
  // };
  // by user
  // const byUser = data
  //   .map((e) => e.contributors)
  //   .flat()
  //   .groupBy('email');
}

export async function githubContributorAnalyze(repoUrl: string) {
  const branch = "analyze-contributors";
  const hash = sha256(repoUrl).slice(0, 16);
  const tmpDir = `./tmp/github-contributor-analyze/${hash}`;
  // const cwd = await gitCheckoutOnBranch({ url: repoUrl, branch, cwd: tmpDir });
  const url = repoUrl;
  const cwd = tmpDir;
  await rmdir(cwd, { recursive: true }).catch(() => {});
  return await mkdir(cwd, { recursive: true })
    .then(async () => {
      await $`git --version || (apt-get update -y && apt-get install -y git)`;
      await $`git clone ${url} ${cwd}`;
      // await sleep(1000);
      const logs = await Bun.$`cd ${cwd} && git shortlog --summary --numbered --email`.text();
      console.log({ logs });
      const contributors = parseGitShortLog(logs);
      console.log(contributors);

      return { repoUrl, contributors, updatedAt: new Date() };
    })
    .finally(async () => {
      // clean
      await rmdir(cwd, { recursive: true }).catch(() => {});
    });
}
