import { fetchIssueComments } from "@/lib/github/fetchIssueComments";

export type GithubIssueComment = Awaited<ReturnType<typeof fetchIssueComments>>[number];
