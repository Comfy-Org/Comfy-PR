import { initTRPC } from "@trpc/server";
import { type OpenApiMeta } from "trpc-openapi";
export const t = initTRPC.meta<OpenApiMeta>().create(); /* 👈 */
