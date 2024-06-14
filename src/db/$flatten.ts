import { type Document, type Filter } from "mongodb";
import { fromPairs, toPairs } from "rambda";
/**
 * This function flattens the filter object, used for mongodb partial queries.
 * otherwise, mongodb will match the nested object as a whole.
 * @example
 * ```ts
 * $flatten({ a: { b: 1 } }) // { "a.b": 1 }
 * 
 * coll.find($flatten({ a: { b: 1 } })) // coll.find({ "a.b": 1 })
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
  filter: Filter<TSchema>,
): Filter<TSchema> {
  if (typeof filter !== "object" || !(filter instanceof Object)) return filter;
  return fromPairs(
    toPairs(filter).flatMap(([k, v]) => {
      if (Array.isArray(v)) return [[k, v.map($flatten)]];
      if (k.startsWith("$")) return [[k, $flatten(v)]];
      if (
        typeof v !== "object" ||
        !(v instanceof Object) ||
        Object.keys(v).some((kk) => kk.startsWith("$"))
      ) {
        return [[k, v]];
      }
      return toPairs(v as Object).map(([kk, vv]) => [`${k}.${kk}`, vv]);
    }, filter) as any,
  );
}
