import { $filaten } from "@/packages/mongodb-pipeline-ts/$filaten";
import { $fresh, $stale } from "@/packages/mongodb-pipeline-ts/$fresh";
import DIE from "@snomiao/die";
import enhancedMs from "enhanced-ms";
import { MongoClient, type Db } from "mongodb";

declare global {
  var _db: Db;
}
const MONGODB_URI = process.env.MONGODB_URI ?? DIE("Missing env.MONGODB_URI");
export const db = (global._db ??= new MongoClient(MONGODB_URI).db());
if (import.meta.main) {
  console.log(await db.admin().ping());
  console.log(enhancedMs("7d") === 7 * 86400e3);
  console.log(JSON.stringify($stale("7d")));
  console.log(JSON.stringify($filaten({ mtime: $stale("7d") })));
  console.log(JSON.stringify($filaten({ mtime: new Date() })));
}

export { $filaten, $fresh, $stale };
