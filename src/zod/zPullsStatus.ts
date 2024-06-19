import { z } from "zod";

export const zPullStatus = z.object({
  updated: z.string(),
  on_registry: z.boolean(),
  state: z.string(),
  url: z.string(),
  head: z.string(),
  comments: z.number(),
  lastwords: z.string(),
});
export const zPullsStatus = z.array(zPullStatus);
