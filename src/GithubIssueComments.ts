import { fetchIssueComments } from "./gh/fetchIssueComments";


export type GithubIssueComment = Awaited<ReturnType<typeof fetchIssueComments>>[number];
