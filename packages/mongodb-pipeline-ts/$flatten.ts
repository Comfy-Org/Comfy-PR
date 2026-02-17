import { type Document, type Filter } from "mongodb";
import { fromPairs, toPairs } from "rambda";
import type { UnwrapArrayDeep } from "./UnwrapArrayDeep";
/**
 * This function flattens the filter object, used for mongodb partial queries.
 * otherwise, mongodb will match the nested object as a whole.
 * @example
 * ```ts
 * $filaten({ a: { b: 1 } }) // { "a.b": 1 }
 *
 * coll.find($filaten({ a: { b: 1 } })) // coll.find({ "a.b": 1 })
 * // this will match the document { a: { b: 1 } } and { a: { b: 1, c: 2 } }
 * // but not { a: { b: 2 } }
 *
 * // by comparison:
 * coll.find({ a: { b: 1 } }) // coll.find({ a: { b: 1 } })
 * // this will only match the document { a: { b: 1 } }
 * // but not { a: { b: 1, c: 2 } } or { a: { b: 2 } }
 * ```
 */
export function $flatten<TSchema extends Document>(
  filter: UnwrapArrayDeep<Filter<TSchema>>,
): Filter<TSchema> {
  const v: unknown = filter;
  if (typeof v !== "object" || !(v instanceof Object)) return v as unknown as Filter<TSchema>;
  if (v instanceof Date) return v as unknown as Filter<TSchema>;
  const obj = v as Record<string, unknown>;
  if (Array.isArray(obj)) return obj.map($flatten) as unknown as Filter<TSchema>;
  return fromPairs(
    toPairs(obj).flatMap(([k, v]) => {
      if (typeof v !== "object" || !(v instanceof Object)) return [[k, v]];
      if (k.startsWith("$")) return [[k, $flatten(v as UnwrapArrayDeep<Filter<TSchema>>)]];
      if (Object.keys(v as object).some((kk) => kk.startsWith("$")))
        return [[k, $flatten(v as UnwrapArrayDeep<Filter<TSchema>>)]];
      // TODO: optimize this
      return toPairs(
        $flatten(
          fromPairs(
            toPairs(v as Record<string, unknown>).map(([kk, vv]) => [`${k}.${kk}`, vv]),
          ) as UnwrapArrayDeep<Filter<TSchema>>,
        ),
      );
    }) as [string, unknown][],
  ) as unknown as Filter<TSchema>;
}
