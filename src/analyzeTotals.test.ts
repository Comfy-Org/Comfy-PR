import { analyzeTotals } from "./analyzeTotals";

it("analyze totals", async () => {
  expect(await analyzeTotals()).toBeTruthy();
});
