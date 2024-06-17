import type { GithubPull } from "./fetchRepoPRs";
import { parsePullState } from "./parsePullState";

export function parsePullsState(data: GithubPull[]) {
  return data.map((e) => ({
    ...e,
    prState: parsePullState(e),
  }));
}
