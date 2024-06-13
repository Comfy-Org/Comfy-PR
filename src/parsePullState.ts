import { GithubPull } from "./fetchRepoPRs";

export function parsePullState(e: GithubPull): "open" | "closed" | "merged" {
  return e.state === "open"
    ? ("open" as const)
    : e.merged_at
      ? ("merged" as const)
      : ("closed" as const);
}
