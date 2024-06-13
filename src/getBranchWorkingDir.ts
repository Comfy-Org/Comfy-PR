import { rm } from "fs/promises";
import { getRepoWorkingDir } from "./getRepoWorkingDir";
import { parseRepoUrl } from "./parseOwnerRepo";

export async function getBranchWorkingDir(
  upstreamUrl: string,
  forkUrl: string,
  branch: string
) {
  const src = parseRepoUrl(upstreamUrl);
  const dir = getRepoWorkingDir(forkUrl);
  const packageName = src.repo;
  const cwd = `${dir}/${branch}/${packageName}`;
  await rm(cwd, { recursive: true }).catch(() => null);
  return cwd;
}
