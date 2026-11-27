import { describe, expect, it } from "bun:test";
import { orderReleasesForRun } from "./releaseSchedule";

const r = (tag: string) => ({ html_url: `https://example.test/releases/${tag}`, tag });
const tags = (list: { tag: string }[]) => list.map((x) => x.tag);

describe("orderReleasesForRun", () => {
  it("keeps the newest release first, then least recently checked", () => {
    const releases = [r("v1.61.9"), r("v1.59.15"), r("v1.61.8"), r("v1.59.14")];
    const checked = new Map([
      [releases[0].html_url, 400],
      [releases[1].html_url, 300],
      [releases[2].html_url, 100],
      [releases[3].html_url, 200],
    ]);
    expect(tags(orderReleasesForRun(releases, checked))).toEqual(["v1.61.9", "v1.61.8", "v1.59.14", "v1.59.15"]);
  });

  it("puts never-checked releases right after the newest, in newest-first order", () => {
    const releases = [r("a"), r("b"), r("c"), r("d")];
    const checked = new Map([[releases[1].html_url, 50]]);
    expect(tags(orderReleasesForRun(releases, checked))).toEqual(["a", "c", "d", "b"]);
  });

  it("handles empty and single lists and does not mutate the input", () => {
    expect(orderReleasesForRun([], new Map())).toEqual([]);
    const one = [r("only")];
    expect(tags(orderReleasesForRun(one, new Map()))).toEqual(["only"]);
    const releases = [r("a"), r("b"), r("c")];
    orderReleasesForRun(releases, new Map([[releases[1].html_url, 9]]));
    expect(tags(releases)).toEqual(["a", "b", "c"]);
  });
});
