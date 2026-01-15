import type { GithubPull } from "@/lib/github/GithubPull";
import { parsePull } from "@/lib/github/parsePull";
export type GithubPullParsed = ReturnType<typeof parsePulls>[number];
export function parsePulls(data: GithubPull[]) {
  return data.map((e) => parsePull(e));
}
