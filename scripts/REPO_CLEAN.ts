import DIE from "@snomiao/die";
import { Octokit } from "octokit";
const GH_TOKEN_FOR_DELETE_REPO =
  process.env.GH_TOKEN_FOR_DELETE_REPO ||
  DIE(
    "Missing env.GH_TOKEN_FOR_DELETE_REPO\n" +
      "Get one from https://github.com/settings/tokens?type=beta\n" +
      "Check delete_repo permission"
  );
const octokit = new Octokit({ auth: GH_TOKEN_FOR_DELETE_REPO });
const gh_deletable = octokit.rest;

const deleteList = [
  "drip-art/PR-ComfyNode-Registry-test-9d050f95",
  "drip-art/PR-ComfyNode-Registry-test-c1020b39",
  "drip-art/PR-ComfyNode-Registry-test-720a7a47",
  "drip-art/PR-ComfyNode-Registry-test-fe0677d1",
  "drip-art/PR-ComfyNode-Registry-test-a996033a",
  "drip-art/PR-ComfyNode-Registry-test-f84e1a5d",
  "drip-art/PR-ComfyNode-Registry-test-a7ab0504",
  "drip-art/PR-ComfyNode-Registry-test-c7ecc72a",
  "drip-art/PR-ComfyNode-Registry-test-c099f89f",
];

for await (const path of deleteList) {
  const [owner, repo] = path.split("/");
  await gh_deletable.repos.delete({
    owner,
    repo,
  });
  console.log(`${path} DELETE OK`);
}
