import { parsePullState } from "./parsePullState";
import { GithubPull } from "./fetchRepoPRs";

export function parsePullsState(data: GithubPull[]) {
  return data.map((e) => ({
    ...e,
    prState: parsePullState(e),
  }));
}
