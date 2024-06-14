import DIE from "@snomiao/die";
import enhancedMs from "enhanced-ms";
import { MongoClient, type Db } from "mongodb";
declare global {
  var _db: Db;
}
export const db = (global._db ??= new MongoClient(process.env.MONGODB_URI ?? DIE("Missing env.MONGODB_URI")).db());

if (import.meta.main) {
  console.log(await db.admin().ping());
  console.log(enhancedMs("7d") === 7 * 86400e3);
  console.log($stale("7d"));
}

export function $staleAt(date: Date | string) {
  return { $not: { $gt: new Date(date) } };
}
export function $stale(interval: number | string) {
  const ms = typeof interval === "string" ? enhancedMs(interval) : interval;
  return { $not: { $gt: new Date(+new Date() - ms) } };
}

export function $freshAt(date: Date | string) {
  return { $gte: new Date(date) };
}
export function $fresh(interval: number | string) {
  const ms = typeof interval === "string" ? enhancedMs(interval) : interval;
  return { $gte: new Date(+new Date() - ms) };
}
