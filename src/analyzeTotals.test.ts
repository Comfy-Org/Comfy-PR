import { test } from "bun:test";
import { analyzeTotals } from "./analyzeTotals";

test.skipIf(!process.env.MONGODB_URI)("analyze totals", async () => {
  const { expect } = await import("bun:test");
  expect(await analyzeTotals()).toBeTruthy();
});
