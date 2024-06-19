import { $before, $fresh, $stale } from "@/packages/mongodb-pipeline-ts/$fresh";
import { tryCatch } from "rambda";
import { z } from "zod";

const znot_include = z.object({ "not-include": z.string() }).transform((x) => ({ $nin: x["not-include"] }));
const mString = z.string().transform((x) =>
  tryCatch<string, string | RegExp>(
    (x) => new RegExp(x) as RegExp,
    (x) => x as string | RegExp,
  )(x),
);
const zbefore = z
  .object({ $before: z.coerce.date().or(z.string()).or(z.number()) })
  .transform((x) => $before(x.$before));
const zfresh = z.object({ $fresh: z.coerce.date().or(z.string()).or(z.number()) }).transform((x) => $fresh(x.$fresh));
const mstale = z.object({ $stale: z.coerce.date().or(z.string()).or(z.number()) }).transform((x) => $stale(x.$stale));
const mDate = z.date().or(zbefore).or(zfresh).or(mstale);
const mAny = z.number().or(znot_include).or(mString).or(zbefore).or(zfresh);
const mNumber = z
  .number()
  .or(z.object({ $gt: z.number() }))
  .or(z.object({ $lt: z.number() }))
  .or(z.object({ $eq: z.number() }))
  .or(z.object({ $ne: z.number() }))
  .or(z.object({ $gte: z.number() }))
  .or(z.object({ $lte: z.number() }));
const zFollowUpRule = z.object({
  name: z.string(),
  $match: z
    .object({
      state: z.enum(["OPEN", "CLOSED", "MERGED"]),
      on_registry: z.boolean(),
      updated_at: mDate,
      lastwords: mString,
      comments: mNumber,
    })
    .strict()
    .partial(),
  action: z
    .object({
      "add-comment": z
        .object({
          by: z.string(),
          body: z.string(),
        })
        .strict(),
      "send-email": z
        .object({
          provider: z.string(),
          from: z.string(),
          to: z.string(),
          subject: z.string(),
          body: z.string(),
        })
        .strict(), // not implementd
      "update-issue": z
        .object({
          tags: mAny,
        })
        .strict(),
      close: z.boolean(),
    })
    .partial()
    .strict(),
});
// zPullsStatus
export const zFollowUpRules = zFollowUpRule.array();
