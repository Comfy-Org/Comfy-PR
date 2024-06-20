import { z } from "zod";

export const zPullStatusFollow = z.array(
  z.object({
    updated: z.string(),
    state: z.string(),
    url: z.string(),
    head: z.string(),
    comments: z.number(),
    lastwords: z.string(),
  }),
);
