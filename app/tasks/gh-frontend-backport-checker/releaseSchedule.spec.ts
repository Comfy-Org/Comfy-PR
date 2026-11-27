import { describe, expect, it } from "bun:test";
import { orderReleasesForRun } from "./releaseSchedule";

const r = (tag: string, day: number) => ({
  html_url: `https://example.test/releases/${tag}`,
  created_at: new Date(Date.UTC(2026, 10, day)).toISOString(),
  tag,
});
const tags = (list: { tag: string }[]) => list.map((x) => x.tag);

describe("orderReleasesForRun", () => {
  it("puts the least recently checked release first", () => {
    const releases = [r("v1.61.9", 4), r("v1.59.15", 3), r("v1.61.8", 2), r("v1.59.14", 1)];
    const checked = new Map([
      [releases[0].html_url, 400],
      [releases[1].html_url, 300],
      [releases[2].html_url, 100],
      [releases[3].html_url, 200],
    ]);
    expect(tags(orderReleasesForRun(releases, checked))).toEqual(["v1.61.8", "v1.59.14", "v1.59.15", "v1.61.9"]);
  });

  it("orders never-checked releases newest first, whatever the input order", () => {
    const releases = [r("old", 1), r("newest", 9), r("mid", 5)];
    expect(tags(orderReleasesForRun(releases, new Map()))).toEqual(["newest", "mid", "old"]);
  });

  it("reaches every release over repeated runs that each check only one", () => {
    const releases = [r("a", 4), r("b", 3), r("c", 2), r("d", 1)];
    const checked = new Map<string, number>();
    const seen: string[] = [];
    for (let run = 1; run <= 8; run++) {
      const first = orderReleasesForRun(releases, checked)[0];
      seen.push(first.tag);
      checked.set(first.html_url, run);
    }
    expect(seen).toEqual(["a", "b", "c", "d", "a", "b", "c", "d"]);
  });

  it("does not mutate the input", () => {
    const releases = [r("a", 1), r("b", 2)];
    orderReleasesForRun(releases, new Map());
    expect(tags(releases)).toEqual(["a", "b"]);
  });
});
