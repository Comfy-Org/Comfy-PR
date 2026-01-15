import DIE from "@snomiao/die";
import { createOctokit } from "./createOctokit";

const GH_TOKEN =
  process.env.GH_TOKEN_COMFY_PR ||
  process.env.GH_TOKEN ||
  DIE("Missing env.GH_TOKEN from https://github.com/settings/tokens?type=beta");

const octokit = createOctokit({ auth: GH_TOKEN });

export const gh = octokit.rest;

import type { components as ghComponents } from "@octokit/openapi-types";
export type GH = ghComponents["schemas"];
