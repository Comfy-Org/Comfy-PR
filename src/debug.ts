import { gh } from "@/lib/github";

console.log(
  await gh.pulls.list({
    state: "open",
    // head: "ComfyNodePRs:update-publish-yaml",
    head: encodeURIComponent("ComfyNodePRs:update-publish-yaml"),

    owner: "snomiao",
    repo: "ComfyUI-DareMerge-test",
    base: "master",
  }),
);
