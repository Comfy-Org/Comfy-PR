import { isRepoBypassed } from "./bypassRepos";

it("bypass", async () => {
  const bypassRepo = "https://github.com/loopyd/ComfyUI-FD-Tagger";
  expect(isRepoBypassed(bypassRepo)).toBeTruthy();
});
it("allow", async () => {
  const allowRepo = "https://github.com/snomiao/ComfyUI-FD-Tagger";
  expect(isRepoBypassed(allowRepo)).toBeFalsy();
});
