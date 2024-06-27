import { z } from "zod";

export const zPullStatus = z.object({
  updated: z.string(), // deprecated
  pull_updated: z.string(),
  repo_updated: z.string(),
  on_registry: z.boolean(),
  state: z.enum(["OPEN", "MERGED", "CLOSED"]),
  url: z.string(),
  head: z.string(),
  comments: z.number(),
  lastwords: z.string(),
  ownername: z.string().optional(),
  repository: z.string().optional(),
  author_email: z.string().optional(),
});
export const zPullsStatus = z.array(zPullStatus);
