import type { GithubPull } from "./gh/GithubPull";
import { parsePull } from "./gh/parsePull";
export type GithubPullParsed = ReturnType<typeof parsePulls>[number];
export function parsePulls(data: GithubPull[]) {
  return data.map((e) => parsePull(e));
}
