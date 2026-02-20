import { $flatten } from "@/packages/mongodb-pipeline-ts/$flatten";
import { $fresh, $stale } from "@/packages/mongodb-pipeline-ts/$fresh";
import enhancedMs from "enhanced-ms";
import hotResource from "hot-resource";
import isCI from "is-ci";
import { MongoClient } from "mongodb";
import sflow from "sflow";

// allow build without env
if (!process.env.MONGODB_URI)
  console.warn("MONGODB_URI is not set, using default value. This may cause issues in production.");
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://PLEASE_SET_MONGODB_URI:27017";

// Skip actual DB connection during Next.js build
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

export const mongo = await (isBuildPhase
  ? Promise.resolve(null as unknown as MongoClient)
  : hotResource(async () => [new MongoClient(MONGODB_URI), (conn) => conn.close()]));

// Create a Proxy for db during build that returns dummy collection objects
const buildTimeDb = new Proxy({} as Record<string, unknown>, {
  get(target, prop) {
    if (prop === "collection") {
      return () =>
        new Proxy({} as Record<string, unknown>, {
          get(target, prop) {
            if (prop === "createIndex") return () => Promise.resolve();
            return () => {};
          },
        });
    }
    if (prop === "close") return async () => {};
    return () => {};
  },
}) as unknown as ReturnType<MongoClient["db"]> & { close: () => Promise<void> };

export const db = isBuildPhase
  ? buildTimeDb
  : Object.assign(mongo.db(), {
      close: async () => await mongo.close(),
    });

// allow db conn for 45 mins in CI env to prevent long running CI jobs
if (isCI) {
  setTimeout(
    async () => {
      await mongo.close();
      // should not be needed, but just in case
      process.exit(0);
    },
    45 * 60 * 1000,
  );
}

if (import.meta.main) {
  console.log(await db.admin().ping());
  console.log(enhancedMs("7d") === 7 * 86400e3);
  console.log(JSON.stringify($stale("7d")));
  console.log(JSON.stringify($flatten({ mtime: $stale("7d") })));
  console.log(JSON.stringify($flatten({ mtime: new Date() })));
  console.log(
    await sflow(db.listCollections())
      .map((e) => e.name)
      .toArray(),
  );
}

export { $flatten, $fresh, $stale };
