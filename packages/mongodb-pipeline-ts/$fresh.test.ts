import DIE from "@snomiao/die";
import { Db, MongoClient, type ObjectId } from "mongodb";
import { $fresh, $stale } from ".";

type g = typeof globalThis & { _db: Db };
export const db = ((global as any as g)._db ??= new MongoClient(
  process.env.MONGODB_URI ?? DIE("Missing env.MONGODB_URI"),
).db());

const Test = db.collection<any>("test-fresh-stale");
// afterAll(async () => await Test.drop());
await Test.createIndex({ t: 1 });

// mock Date
const now = new Date();
jest.useFakeTimers().setSystemTime(now);
afterAll(() => jest.useRealTimers());

const staleDate = new Date(+now - 86400e3); // 1day ago
const notStaleDate = new Date(+staleDate + 1);
const tooStaleDate = new Date(+staleDate - 1);

const freshDate = new Date(+now - 86400e3); // 1day ago + 1ms
const tooFreshDate = new Date(+freshDate + 1);
const notFreshDate = new Date(+freshDate - 1);
const tNull = undefined;

it("stale at", async () => {
  expect(await Test.findOne({ _id: await at(tNull), t: $stale(staleDate) })).toBeTruthy();
  expect(
    await Test.findOne({
      _id: await at(tooStaleDate),
      t: $stale(staleDate),
    }),
  ).toBeTruthy();
  expect(await Test.findOne({ _id: await at(staleDate), t: $stale(staleDate) })).toBeTruthy();
  expect(
    await Test.findOne({
      _id: await at(notStaleDate),
      t: $stale(staleDate),
    }),
  ).toBe(null);
});
it("stale", async () => {
  expect(await Test.findOne({ _id: await at(tNull), t: $stale("1d") })).toBeTruthy();
  expect(await Test.findOne({ _id: await at(tooStaleDate), t: $stale("1d") })).toBeTruthy();
  expect(await Test.findOne({ _id: await at(staleDate), t: $stale("1d") })).toBeTruthy();
  expect(await Test.findOne({ _id: await at(notStaleDate), t: $stale("1d") })).toBe(null);
});

it("fresh at", async () => {
  expect(await Test.findOne({ _id: await at(tNull), t: $fresh(freshDate) })).toBeNull();
  expect(
    await Test.findOne({
      _id: await at(notFreshDate),
      t: $fresh(freshDate),
    }),
  ).toBeNull();
  expect(await Test.findOne({ _id: await at(freshDate), t: $fresh(freshDate) })).toBeTruthy();
  expect(
    await Test.findOne({
      _id: await at(tooFreshDate),
      t: $fresh(freshDate),
    }),
  ).toBeTruthy();
});

it("fresh", async () => {
  expect(await Test.findOne({ _id: await at(tNull), t: $fresh("1d") })).toBeNull();
  expect(await Test.findOne({ _id: await at(notFreshDate), t: $fresh("1d") })).toBeNull();
  expect(await Test.findOne({ _id: await at(freshDate), t: $fresh("1d") })).toBeTruthy();
  expect(await Test.findOne({ _id: await at(tooFreshDate), t: $fresh("1d") })).toBeTruthy();
});

async function at(t?: Date): Promise<ObjectId> {
  return (await Test.insertOne({ t })).insertedId;
}
