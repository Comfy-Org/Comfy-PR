import { Octokit } from "octokit";
import { question } from "zx";
import DIE from "@snomiao/die";
const GH_TOKEN =
  process.env.GH_TOKEN ||
  (await question(
    "Input GH_TOKEN from https://github.com/settings/tokens?type=beta: "
  )) ||
  DIE("Missing env.GH_TOKEN from https://github.com/settings/tokens?type=beta");
const octokit = new Octokit({ auth: GH_TOKEN });
export const gh = octokit.rest;
