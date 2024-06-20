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
export function $filaten<TSchema extends Document>(filter: UnwrapArrayDeep<Filter<TSchema>>): Filter<TSchema> {
  const v = filter as any;
  if (typeof v !== "object" || !(v instanceof Object)) return v;
  if (v instanceof Date) return v;
  if (Array.isArray(v)) return v.map($filaten) as any;
  return fromPairs(
    toPairs(v).flatMap(([k, v]) => {
      if (typeof v !== "object" || !(v instanceof Object)) return [[k, v]];
      if (k.startsWith("$")) return [[k, $filaten(v)]];
      if (Object.keys(v).some((kk) => kk.startsWith("$"))) return [[k, $filaten(v)]];
      // TODO: optimize this
      return toPairs($filaten(fromPairs(toPairs(v).map(([kk, vv]) => [`${k}.${kk}`, vv]))));
    }, v) as any,
  );
}
