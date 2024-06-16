import type { Filter } from "mongodb";

/**
 * Wraps a filter in an $elemMatch expression.
 * @param filter The filter to wrap.
 * @returns The filter wrapped in an $elemMatch expression.
 *
 * @example
 * ```ts
 * $flatten({
 *   crPulls: {
 *     data: $elemMatch({
 *       // type: "pyproject",
 *       pull: {
 *         updated_at: {
 *           $lt: new Date().toISOString().replace(/.\d\d\dZ/, ""),
 *         },
 *       },
 *     }),
 *   },
 * })
 * ```
 */
export function $elemMatch<T extends Filter<Document>>(filter: T): [T] {
  if (typeof filter !== "object" || !(filter instanceof Object)) return filter;
  return { $elemMatch: filter } as any;
}
