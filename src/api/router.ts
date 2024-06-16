import z from "zod";
import { t } from "./trpc";

export const router = t.router({
    sayHello: t.procedure
        .meta({ openapi: { method: "GET", path: "/say-hello", description: "say hello" } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => {
            return { greeting: `Hello ${input.name}!` };
        }),
    followComments: t.procedure
        .meta({ openapi: { method: "GET", path: "/say-hello", description: "say hello" } })
        .input(z.object({ name: z.string() }))
        .output(z.object({ greeting: z.string() }))
        .query(({ input }) => {
            return { greeting: `Hello ${input.name}!` };
        }),
});
