import DIE from "@snomiao/die";
import { MongoClient, type Db } from "mongodb";

declare global {
  var _db: Db;
}
export const db = (global._db ??= new MongoClient(
  process.env.MONGODB_URI ?? DIE("Missing env.MONGODB_URI")
  // if local
  // "mongodb://mongodb:27017"
  // "mongodb://host.docker.internal:27017"
).db());

if (import.meta.main) {
    console.log(await db.admin().ping())
}