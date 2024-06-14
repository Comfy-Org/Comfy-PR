import { type Document, type Filter } from "mongodb";
import { fromPairs, toPairs } from "rambda";

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
