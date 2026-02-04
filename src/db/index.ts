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

// Detect if we're in a build/compile phase (not runtime)
const IS_BUILD_PHASE =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.VERCEL_ENV === "preview" ||
  (process.env.NODE_ENV === "production" && !process.env.MONGODB_URI) ||
  // During GitHub Actions build
  (process.env.CI && !process.env.MONGODB_URI);

// Lazy initialization to avoid blocking during Next.js build
let _mongo: Awaited<ReturnType<typeof hotResource<MongoClient>>> | null = null;
let _initPromise: Promise<Awaited<ReturnType<typeof hotResource<MongoClient>>>> | null = null;

async function getMongo() {
  // During build phase, return a mock that never connects
  if (IS_BUILD_PHASE) {
    throw new Error("MongoDB connection not available during build phase");
  }

  if (_mongo) return _mongo;
  if (_initPromise) return _initPromise;

  _initPromise = hotResource(async () => [new MongoClient(MONGODB_URI), (conn) => conn.close()]);
  _mongo = await _initPromise;

  // allow db conn for 45 mins in CI env to prevent long running CI jobs
  if (isCI) {
    setTimeout(
      async () => {
        await _mongo?.close();
        // should not be needed, but just in case
        process.exit(0);
      },
      45 * 60 * 1000,
    );
  }

  return _mongo;
}

export const mongo = new Proxy({} as Awaited<ReturnType<typeof hotResource<MongoClient>>>, {
  get: (target, prop) => {
    if (prop === "then") return undefined; // Prevent Promise auto-awaiting
    return (...args: any[]) =>
      getMongo().then((m) => {
        const value = (m as any)[prop];
        return typeof value === "function" ? value.apply(m, args) : value;
      });
  },
});

// Proxy for collection to make createIndex and other methods lazy
function createCollectionProxy(collectionName: string): any {
  // Use a plain object that can be extended with Object.assign
  const target = {} as any;

  return new Proxy(target, {
    get: (target, prop) => {
      if (prop === "then") return undefined; // Prevent Promise auto-awaiting

      // Check if property was added directly to the target (e.g., via Object.assign)
      if (prop in target) {
        return target[prop];
      }

      // Return a function that lazily connects and calls the method
      const lazyMethod = (...args: any[]) => {
        // During build phase, return a resolved promise with a no-op
        if (IS_BUILD_PHASE) {
          return Promise.resolve({});
        }

        return getMongo().then((m) => {
          const dbInstance = m.db();
          const collection = dbInstance.collection(collectionName);
          const value = (collection as any)[prop];
          return typeof value === "function" ? value.apply(collection, args) : value;
        });
      };

      return lazyMethod;
    },
    // Allow properties to be set (for Object.assign)
    set: (target, prop, value) => {
      target[prop] = value;
      return true;
    },
    // Make the proxy look like an object with methods
    has: (target, prop) => prop in target || true,
    ownKeys: (target) => [
      ...Object.keys(target),
      "createIndex",
      "findOne",
      "find",
      "insertOne",
      "updateOne",
      "deleteOne",
    ],
    getOwnPropertyDescriptor: (target, prop) => {
      if (prop in target) {
        return Object.getOwnPropertyDescriptor(target, prop);
      }
      return { enumerable: true, configurable: true, writable: true };
    },
  });
}

export const db = new Proxy({} as ReturnType<MongoClient["db"]> & { close: () => Promise<void> }, {
  get: (target, prop) => {
    if (prop === "then") return undefined; // Prevent Promise auto-awaiting
    if (prop === "close") {
      return async () => {
        if (IS_BUILD_PHASE) return;
        const m = await getMongo();
        return m.close();
      };
    }
    if (prop === "collection") {
      return (name: string, options?: any) => createCollectionProxy(name);
    }
    return (...args: any[]) => {
      if (IS_BUILD_PHASE) return Promise.resolve({});
      return getMongo().then((m) => {
        const dbInstance = m.db();
        const value = (dbInstance as any)[prop];
        return typeof value === "function" ? value.apply(dbInstance, args) : value;
      });
    };
  },
});

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

export { $flatten as $flatten, $fresh, $stale };
