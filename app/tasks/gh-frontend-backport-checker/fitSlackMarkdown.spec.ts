import { describe, expect, test } from "bun:test";
import { fitSlackMarkdown } from "./fitSlackMarkdown";

describe("fitSlackMarkdown", () => {
  test("returns short reports unchanged", () => {
    expect(fitSlackMarkdown("a\nb\n", 100)).toBe("a\nb\n");
  });

  test("cuts whole trailing lines and counts them", () => {
    const report = ["**header**", "", ...Array.from({ length: 50 }, (_, i) => `line ${i}`)].join("\n");
    const out = fitSlackMarkdown(report, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.startsWith("**header**\n")).toBe(true);
    const shown = out.split("\n").filter((l) => l.startsWith("line ")).length;
    expect(out).toContain(`…and ${50 - shown} more not shown`);
    expect(out.split("\n").every((l) => !l.startsWith("line ") || /^line \d+$/.test(l))).toBe(true);
  });

  test("does not stack blank lines before the note when the cut follows a blank line", () => {
    const report = ["a".repeat(40), "", "b".repeat(200)].join("\n");
    const out = fitSlackMarkdown(report, 120);
    expect(out).toBe(`${"a".repeat(40)}\n\n_…and 1 more not shown (Slack message size limit)_\n`);
    expect(out).not.toContain("\n\n\n");
  });
});
