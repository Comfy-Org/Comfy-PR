import DIE from "@snomiao/die";
import type { ObjectId } from "mongodb";
import { omit } from "rambda";
import { z } from "zod";
import { db } from ".";

const _TaskMeta = db.collection<{ coll: string }>("TaskMeta");
await _TaskMeta.createIndex({ coll: 1 }, { unique: true }); // Ensure unique collection names

/**
 * @deprecated Use MetaCollection for not repeating yourself on collection name
 */
export const TaskMetaCollection = <S extends z.ZodObject<any>, const COLLECTION_NAME extends string = string>(
  coll: COLLECTION_NAME,
  schema: S,
) => {
  const c = db.collection<{ coll: COLLECTION_NAME } & z.infer<S>>(_TaskMeta.collectionName);
  return Object.assign(c, {
    $upsert: async (data: Partial<z.infer<S>>) => {
      // Validate data with schema
      try {
        schema.partial().parse(data);
      } catch (error: unknown | z.ZodError) {
        if (error instanceof z.ZodError) {
          throw new Error(
            `Validation failed: ${error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
          );
        }
        throw error;
      }

      return (
        (await c.findOneAndUpdate({ coll }, { $set: omit("coll", data) }, { upsert: true, returnDocument: "after" })) ||
        DIE("never")
      );
    },
    save: async (data: z.infer<S>) => {
      // Validate data with schema
      try {
        schema.parse(data);
      } catch (error: unknown | z.ZodError) {
        if (error instanceof z.ZodError) {
          throw new Error(
            `Validation failed: ${error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
          );
        }
        throw error;
      }

      return (
        (await c.findOneAndUpdate({ coll }, { $set: omit("coll", data) }, { upsert: true, returnDocument: "after" })) ||
        DIE("never")
      );
    },
  });
};

type CollectionWithName<NAME extends string> = {
  collectionName: NAME;
};
/**
 * Generic MetaCollection creator
 *
 * @example
 * const Meta = MetaCollection(GithubIssueLabelOps, z.object({ ... }));
 * const meta = await Meta.save({ ... });
 */
export const MetaCollection = <S extends z.ZodObject<any>, const COLLECTION_NAME extends string = string>(
  coll: CollectionWithName<COLLECTION_NAME>,
  schema: S,
) => TaskMetaCollection(coll.collectionName, schema);

if (import.meta.main) {
  // Example usage with schema
  const coll = db.collection("example");
  const Meta = MetaCollection(
    coll,
    z.object({
      key: z.string(),
      updatedAt: z.date(),
      optional: z.string().optional(), // Optional field
    }),
  );

  const meta = await Meta.save({
    key: "value",
    updatedAt: new Date(),
    // asd: '123' // will throw validation error if uncommented
  });
  meta._id satisfies ObjectId; // Access the _id field
  // meta.coll satisfies "example"; // = string
  // meta.key; // Access the key field
  meta.updatedAt satisfies Date; // Access the updatedAt field
  // meta.optional; // Access the optional field, will be undefined if not set

  console.log("Meta updated:", meta);
  console.log("Config collection initialized.");
}
