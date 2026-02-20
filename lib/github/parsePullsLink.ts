import { type Link } from "@/src/types/Link";
import { type GithubPull } from "./GithubPull";
export function parsePRlink(e: GithubPull): Link {
  const { number: _number, title, html_url, state, merged_at } = e;
  const _repo = html_url.match(/(.*?\/.*?)(?=\/pull\/\d+$)/g)![0].replace("https://github.com", "");
  return {
    // name: `${repo} PR#${number}: ${(merged_at ? "merged" : state).toUpperCase()}`,
    name: `${html_url.replace("https://github.com", "")} #${(merged_at
      ? "merged"
      : state
    ).toUpperCase()} - ${title}`.slice(0, 78),
    href: html_url,
  };
}
