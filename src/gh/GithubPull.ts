import { gh } from ".";

export type GithubPull = Awaited<ReturnType<typeof gh.pulls.get>>["data"];
