import { z } from "zod";

export const zPullStatus = z.object({
  pull_updated: z.string(),
  repo_updated: z.string(),
  on_registry: z.boolean(),
  state: z.string(),
  url: z.string(),
  head: z.string(),
  comments: z.number(),
  lastwords: z.string(),
});
export const zPullsStatus = z.array(zPullStatus);
