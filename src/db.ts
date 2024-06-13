import DIE from "@snomiao/die";
import enhancedMs from "enhanced-ms";
import { MongoClient, type Db, type Document, type Filter } from "mongodb";
import { fromPairs, toPairs } from "rambda";
declare global {
  var _db: Db;
}
export const db = (global._db ??= new MongoClient(
  process.env.MONGODB_URI ?? DIE("Missing env.MONGODB_URI"),
).db());

if (import.meta.main) {
  console.log(await db.admin().ping());
}
export function $stale(interval: number | string) {
  const ms = typeof interval === "string" ? enhancedMs(interval) : interval;
  return { $not: $fresh(ms * 0.9) } as const;
}
export function $fresh(interval: number | string) {
  const ms = typeof interval === "string" ? enhancedMs(interval) : interval;
  return { $gt: new Date(+new Date() - ms * 1.1) };
}

export function $flatten<TSchema extends Document>(
  filter: Filter<TSchema>,
): Filter<TSchema> {
  return fromPairs(
    toPairs(filter).flatMap(([k, v]) => {
      if (typeof v !== "object") return [k, v];
      if (v === null) return [k, v];
      if (k.startsWith("$")) return [k, v];
      if (Array.isArray(v)) return [k, v];
      if (v instanceof Date) return [k, v];
      return toPairs(v as Object).map(([kk, vv]) => [`${k}.${kk}`, vv]);
    }, filter) as any,
  );
}
