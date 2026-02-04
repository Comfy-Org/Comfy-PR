import DIE from "@snomiao/die";
import { Octokit } from "octokit";

// Lazy initialization to avoid failing during Next.js build
let _octokit: Octokit | null = null;
function getOctokit() {
  if (!_octokit) {
    const GH_TOKEN =
      process.env.GH_TOKEN_COMFY_PR ||
      process.env.GH_TOKEN ||
      DIE("Missing env.GH_TOKEN from https://github.com/settings/tokens?type=beta");
    _octokit = new Octokit({ auth: GH_TOKEN });
  }
  return _octokit;
}

export const gh = new Proxy({} as Octokit["rest"], {
  get: (target, prop) => {
    return getOctokit().rest[prop as keyof Octokit["rest"]];
  },
});
// TODO: use async-sema for gh requests

import type { components as ghComponents } from "@octokit/openapi-types";
export type GH = ghComponents["schemas"];
