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

// In test environments, use regular MongoClient without hot-resource
// hot-resource is designed for hot-reloading and keeps resources alive globally
// which prevents tests from exiting cleanly
const isTestEnvironment = process.env.NODE_ENV === "test" || Bun.argv.some((arg) => arg.includes("test"));

export const mongo = await (isBuildPhase
  ? Promise.resolve(null as unknown as MongoClient)
  : isTestEnvironment
    ? new MongoClient(MONGODB_URI).connect()
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
// but not during tests (tests should clean up properly)
if (isCI && !isTestEnvironment) {
  const timeout = setTimeout(
    async () => {
      // this should not happen often
      // best to fix the long running jobs by db.close() after tests done or job done
      console.error("[WARNING] Closing long running DB connection in CI after 45 mins");
      console.error("Please fix your tests/jobs to close the DB connection when done to prevent this warning");
      await mongo.close();
      // should not be needed, but just in case
      process.exit(0);
    },
    45 * 60 * 1000,
  );
  // Don't keep the process alive just for this timeout
  // This allows tests to exit cleanly if all other work is done
  timeout.unref();
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
