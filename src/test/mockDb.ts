/**
 * In-memory mock database for tests
 *
 * This provides a complete mock of MongoDB operations to prevent
 * test isolation issues with Bun's mock.module which leaks between test files.
 *
 * Usage in test files:
 * ```ts
 * import { createMockDb, resetMockDb } from "@/src/test/mockDb";
 *
 * const mockDb = createMockDb();
 * mock.module("@/src/db", () => ({ db: mockDb }));
 * ```
 */

// In-memory document storage
const inMemoryDocs = new Map<string, Map<string, unknown>>();
let docIdCounter = 0;

/**
 * Reset all in-memory document storage
 */
export function resetMockDb() {
  inMemoryDocs.clear();
  docIdCounter = 0;
}

/**
 * Create a mock collection with all common MongoDB methods
 */
function createMockCollection(collectionName: string) {
  if (!inMemoryDocs.has(collectionName)) {
    inMemoryDocs.set(collectionName, new Map());
  }
  const docs = inMemoryDocs.get(collectionName)!;

  return {
    createIndex: async () => ({}),

    findOne: async (filter: Record<string, unknown>) => {
      for (const doc of docs.values()) {
        const d = doc as Record<string, unknown>;
        let match = true;
        for (const key of Object.keys(filter)) {
          if (key === "$or") {
            const orConditions = filter.$or as Array<Record<string, unknown>>;
            match = orConditions.some((condition) =>
              Object.keys(condition).every((k) => d[k] === condition[k]),
            );
          } else if (d[key] !== filter[key]) {
            match = false;
          }
        }
        if (match) return doc;
      }
      return null;
    },

    findOneAndUpdate: async (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown> },
      options?: { upsert?: boolean; returnDocument?: string },
    ) => {
      let existing = null;
      for (const [id, doc] of docs.entries()) {
        const d = doc as Record<string, unknown>;
        let match = true;
        for (const key of Object.keys(filter)) {
          if (d[key] !== filter[key]) {
            match = false;
            break;
          }
        }
        if (match) {
          existing = { id, doc };
          break;
        }
      }

      if (existing) {
        const updated = { ...existing.doc as object, ...update.$set };
        docs.set(existing.id, updated);
        return updated;
      } else if (options?.upsert) {
        const id = `mock_id_${++docIdCounter}`;
        const newDoc = { ...filter, ...update.$set, _id: id };
        docs.set(id, newDoc);
        return newDoc;
      }
      return null;
    },

    insertOne: async (doc: unknown) => {
      const id = `mock_id_${++docIdCounter}`;
      const docWithId = { ...(doc as object), _id: id };
      docs.set(id, docWithId);
      return { insertedId: id };
    },

    insertMany: async (documents: unknown[]) => {
      const insertedIds: string[] = [];
      for (const doc of documents) {
        const id = `mock_id_${++docIdCounter}`;
        const docWithId = { ...(doc as object), _id: id };
        docs.set(id, docWithId);
        insertedIds.push(id);
      }
      return { insertedIds };
    },

    find: (filter?: Record<string, unknown>) => ({
      toArray: async () => {
        if (!filter || Object.keys(filter).length === 0) {
          return Array.from(docs.values());
        }
        const results: unknown[] = [];
        for (const doc of docs.values()) {
          const d = doc as Record<string, unknown>;
          let match = true;
          for (const key of Object.keys(filter)) {
            if (d[key] !== filter[key]) {
              match = false;
              break;
            }
          }
          if (match) results.push(doc);
        }
        return results;
      },
      sort: () => ({
        limit: () => ({
          toArray: async () => Array.from(docs.values()),
        }),
        toArray: async () => Array.from(docs.values()),
      }),
      limit: () => ({
        toArray: async () => Array.from(docs.values()),
      }),
    }),

    deleteMany: async (filter?: Record<string, unknown>) => {
      if (!filter || Object.keys(filter).length === 0) {
        const count = docs.size;
        docs.clear();
        return { deletedCount: count };
      }
      let count = 0;
      for (const [id, doc] of docs.entries()) {
        const d = doc as Record<string, unknown>;
        let match = true;
        for (const key of Object.keys(filter)) {
          if (d[key] !== filter[key]) {
            match = false;
            break;
          }
        }
        if (match) {
          docs.delete(id);
          count++;
        }
      }
      return { deletedCount: count };
    },

    deleteOne: async (filter: Record<string, unknown>) => {
      for (const [id, doc] of docs.entries()) {
        const d = doc as Record<string, unknown>;
        let match = true;
        for (const key of Object.keys(filter)) {
          if (d[key] !== filter[key]) {
            match = false;
            break;
          }
        }
        if (match) {
          docs.delete(id);
          return { deletedCount: 1 };
        }
      }
      return { deletedCount: 0 };
    },

    countDocuments: async (filter?: Record<string, unknown>) => {
      if (!filter || Object.keys(filter).length === 0) {
        return docs.size;
      }
      let count = 0;
      for (const doc of docs.values()) {
        const d = doc as Record<string, unknown>;
        let match = true;
        for (const key of Object.keys(filter)) {
          if (d[key] !== filter[key]) {
            match = false;
            break;
          }
        }
        if (match) count++;
      }
      return count;
    },

    updateOne: async (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown> },
    ) => {
      for (const [id, doc] of docs.entries()) {
        const d = doc as Record<string, unknown>;
        let match = true;
        for (const key of Object.keys(filter)) {
          if (d[key] !== filter[key]) {
            match = false;
            break;
          }
        }
        if (match) {
          const updated = { ...d, ...update.$set };
          docs.set(id, updated);
          return { modifiedCount: 1 };
        }
      }
      return { modifiedCount: 0 };
    },

    updateMany: async (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown> },
    ) => {
      let count = 0;
      for (const [id, doc] of docs.entries()) {
        const d = doc as Record<string, unknown>;
        let match = true;
        for (const key of Object.keys(filter)) {
          if (d[key] !== filter[key]) {
            match = false;
            break;
          }
        }
        if (match) {
          const updated = { ...d, ...update.$set };
          docs.set(id, updated);
          count++;
        }
      }
      return { modifiedCount: count };
    },

    aggregate: () => ({
      toArray: async () => [],
    }),

    bulkWrite: async () => ({ modifiedCount: 0, insertedCount: 0 }),
  };
}

/**
 * Create a complete mock database object
 */
export function createMockDb() {
  return {
    collection: (name: string) => createMockCollection(name),
    admin: () => ({
      ping: async () => ({ ok: 1 }),
    }),
  };
}

/**
 * Get all documents stored in a collection (for test assertions)
 */
export function getMockDbDocuments(collectionName: string): unknown[] {
  const docs = inMemoryDocs.get(collectionName);
  return docs ? Array.from(docs.values()) : [];
}

/**
 * Insert a document into a collection (for setting up test data)
 */
export function insertMockDbDocument(collectionName: string, doc: unknown): string {
  if (!inMemoryDocs.has(collectionName)) {
    inMemoryDocs.set(collectionName, new Map());
  }
  const docs = inMemoryDocs.get(collectionName)!;
  const id = `mock_id_${++docIdCounter}`;
  const docWithId = { ...(doc as object), _id: id };
  docs.set(id, docWithId);
  return id;
}
