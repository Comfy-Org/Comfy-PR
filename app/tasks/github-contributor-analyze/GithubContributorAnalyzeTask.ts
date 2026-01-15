import { db } from "@/src/db";

export type Contributor = {
  count: number;
  name: string;
  email: string;
};

export type GithubContributorAnalyzeTask = {
  repoUrl: string; // unique task id
  contributors?: Contributor[];
  updatedAt?: Date;
  error?: string;
  errorAt?: Date;
};

export const GithubContributorAnalyzeTask = db.collection<GithubContributorAnalyzeTask>(
  "GithubContributorAnalzyeTask",
); // git shortlog --summary --numbered --email
export const GithubContributorAnalyzeTaskFilter = {
  updatedAt: { $not: { $gt: new Date(Date.now() - 1000 * 60 * 60 * 24) } },
};
// todo: rename GithubContributorAnalzyeTask => GithubContributorAnalyzeTask
