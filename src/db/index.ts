import { $flatten } from "@/packages/mongodb-pipeline-ts/$flatten";
import { $fresh, $freshAt, $stale, $staleAt } from "@/packages/mongodb-pipeline-ts/$fresh";
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
  console.log(JSON.stringify($stale("7d")));
  console.log(JSON.stringify($flatten({ mtime: $stale("7d") })));
  console.log(JSON.stringify($flatten({ mtime: new Date() })));
}

export { $flatten, $fresh, $freshAt, $stale, $staleAt };
