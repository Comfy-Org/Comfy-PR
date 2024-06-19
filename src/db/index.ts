import { $filaten } from "@/packages/mongodb-pipeline-ts/$filaten";
import { $fresh, $stale } from "@/packages/mongodb-pipeline-ts/$fresh";
import DIE from "@snomiao/die";
import enhancedMs from "enhanced-ms";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? DIE("Missing env.MONGODB_URI");
type g = typeof global & { mongoClient: MongoClient };
export const mongoClient = ((global as g).mongoClient ??= new MongoClient(MONGODB_URI));
export const db = mongoClient.db();

if (import.meta.main) {
  console.log(await db.admin().ping());
  console.log(enhancedMs("7d") === 7 * 86400e3);
  console.log(JSON.stringify($stale("7d")));
  console.log(JSON.stringify($filaten({ mtime: $stale("7d") })));
  console.log(JSON.stringify($filaten({ mtime: new Date() })));
}

export { $filaten, $fresh, $stale };
