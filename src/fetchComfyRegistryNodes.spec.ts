import { describe, expect, test } from "bun:test";
import { fetchAllPages } from "./fetchComfyRegistryNodes";

describe("fetchAllPages", () => {
  test("concatenates every page", async () => {
    const pages: Record<number, number[]> = { 1: [1, 2], 2: [3, 4], 3: [5] };
    const requested: number[] = [];
    const nodes = await fetchAllPages(async (page) => {
      requested.push(page);
      return { nodes: pages[page], totalPages: 3 };
    });
    expect(nodes).toEqual([1, 2, 3, 4, 5]);
    expect(requested).toEqual([1, 2, 3]);
  });

  test("reads a single page once", async () => {
    let calls = 0;
    const nodes = await fetchAllPages(async () => {
      calls++;
      return { nodes: ["a"], totalPages: 1 };
    });
    expect(nodes).toEqual(["a"]);
    expect(calls).toBe(1);
  });

  test("throws on a malformed page", async () => {
    await expect(
      fetchAllPages(async () => ({ nodes: undefined as never, totalPages: 1 })),
    ).rejects.toThrow();
  });

  test.each([undefined, null, 0, -1, 1.5, Number.NaN])(
    "throws on invalid totalPages %p instead of returning page 1 only",
    async (totalPages) => {
      await expect(
        fetchAllPages(async () => ({ nodes: ["a"], totalPages: totalPages as never })),
      ).rejects.toThrow();
    },
  );
});
