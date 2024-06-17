import pkg from "@/package.json";
import { initTRPC } from "@trpc/server";
import { type OpenApiMeta } from "trpc-openapi";
import z from "zod";
export const t = initTRPC.meta<OpenApiMeta>().create(); /* 👈 */
export const router = t.router({
  sayHello: t.procedure
    .meta({ openapi: { method: "GET", path: "/say-hello", description: "say hello" } })
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => {
      return { greeting: `Hello ${input.name} 1!` };
    }),
  version: t.procedure
    .meta({ openapi: { method: "GET", path: "/version", description: "Get version" } })
    .input(z.object({}))
    .output(z.object({ version: z.string() }))
    .query(({}) => ({ version: pkg.version })),
});
