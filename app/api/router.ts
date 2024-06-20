import pkg from "@/package.json";
import { getWorkerInstance } from "@/src/WorkerInstances";
import { analyzePullsStatus } from "@/src/analyzePullsStatus";
import { zPullsStatus } from "@/src/zod/zPullsStatus";
import DIE from "@snomiao/die";
import { initTRPC } from "@trpc/server";
import { type OpenApiMeta } from "trpc-openapi";
import z from "zod";
export const t = initTRPC.meta<OpenApiMeta>().create(); /* 👈 */
export const router = t.router({
  // sayHello: t.procedure
  //   .meta({ openapi: { method: "GET", path: "/say-hello", description: "say hello" } })
  //   .input(z.object({ name: z.string() }))
  //   .output(z.object({ greeting: z.string() }))
  //   .query(({ input }) => {
  //     return { greeting: `Hello ${input.name} 1!` };
  //   }),
  version: t.procedure
    .meta({ openapi: { method: "GET", path: "/version", description: "Get version of ComfyPR" } })
    .input(z.object({}))
    .output(z.object({ version: z.string() }))
    .query(({}) => ({ version: pkg.version })),
  dumpCsv: t.procedure
    .meta({ openapi: { method: "GET", path: "/dump.csv", description: "Get csv dump" } })
    .input(z.object({}))
    .output(z.string())
    .query(() => DIE("Should impl in nextjs route.")),
  dumpYaml: t.procedure
    .meta({ openapi: { method: "GET", path: "/dump.yaml", description: "Get yaml dump" } })
    .input(z.object({}))
    .output(z.string())
    .query(() => DIE("Should impl in nextjs route.")),
  getWorker: t.procedure
    .meta({ openapi: { method: "GET", path: "/worker", description: "Get current worker" } })
    .input(z.object({}))
    .output(z.any())
    .query(async () => await getWorkerInstance()),
  analyzePullsStatus: t.procedure
    .meta({ openapi: { method: "GET", path: "/analyze-pulls-status", description: "Get current worker" } })
    .input(z.object({ skip: z.number(), limit: z.number() }).partial())
    .output(zPullsStatus)
    .query(async ({ input: { limit = 0, skip = 0 } }) => (await analyzePullsStatus({ limit, skip })) as any),
});
