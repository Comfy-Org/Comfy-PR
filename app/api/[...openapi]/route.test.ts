// bun dev before running this test
import pkg from "@/package.json";
import { expect, it } from "bun:test";
import { isTestApiUp } from "./isTestApiUp";
import { testApiBase } from "./testApiBase";

it.skipIf(!isTestApiUp)
it.skip("should fetch version", async () => {
  const response = await fetch(testApiBase + "/version");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ version: pkg.version });
});
