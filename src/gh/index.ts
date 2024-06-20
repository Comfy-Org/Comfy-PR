import DIE from "@snomiao/die";
import { Octokit } from "octokit";
const GH_TOKEN =
  process.env.GH_TOKEN_COMFY_PR ||
  process.env.GH_TOKEN ||
  DIE("Missing env.GH_TOKEN from https://github.com/settings/tokens?type=beta");
const octokit = new Octokit({ auth: GH_TOKEN });
export const gh = octokit.rest;
