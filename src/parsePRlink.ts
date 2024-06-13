import { type GithubPull } from "./fetchRepoPRs";
import { Link } from "./Link";


export function parsePRlink(e: GithubPull): Link {
  const { number, title, html_url, state, merged_at } = e;
  const repo = html_url
    .match(/(.*?\/.*?)(?=\/pull\/\d+$)/g)![0]
    .replace("https://github.com", "");
  return {
    // name: `${repo} PR#${number}: ${(merged_at ? "merged" : state).toUpperCase()}`,
    name: `${html_url.replace("https://github.com", "")} #${(merged_at
      ? "merged"
      : state
    ).toUpperCase()} - ${title}`.slice(0, 78),
    href: html_url,
  };
}
