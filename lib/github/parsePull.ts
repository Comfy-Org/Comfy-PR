import type { GithubPull } from "./GithubPull";

export function parsePull(e: GithubPull) {
  return {
    ...e,
    title: e.title,
    number: e.number,
    url: e.html_url,
    html_url: e.html_url,
    user: {
      ...(e.user as {}),
      login: e.user.login,
      html_url: e.user.html_url,
    },
    body: e.body,
    prState:
      e.state === "open"
        ? ("open" as const)
        : e.merged_at
          ? ("merged" as const)
          : ("closed" as const),
    updatedAt: new Date(e.updated_at),
    createdAt: new Date(e.created_at),
    updated_at: new Date(e.updated_at),
    created_at: new Date(e.created_at),
  };
}
