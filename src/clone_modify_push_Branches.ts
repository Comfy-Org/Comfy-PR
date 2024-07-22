import { makePublishcrBranch } from "./makePublishBranch";
import { makePyprojectBranch } from "./makeTomlBranch";

export async function clone_modify_push_Branches(upstreamUrl: string, forkUrl: string) {
  return (
    await Promise.all([
      makePyprojectBranch(upstreamUrl, forkUrl),
      makePublishcrBranch(upstreamUrl, forkUrl),
      // makeLicenseUpdateBranch(upstreamUrl, forkUrl),
    ])
  )
    .flatMap((e) => (e ? [e] : []))
    .map(({ body, branch, title, type }) => ({
      body,
      branch,
      title,
      type,
      srcUrl: forkUrl,
      dstUrl: upstreamUrl,
    }));
}
