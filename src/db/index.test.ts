import type { ObjectId } from "mongodb";
import "peek-log";
import { $fresh, $freshAt, $stale, $staleAt, db } from ".";

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

it("staleAt", async () => {
  expect(
    await Test.findOne({ _id: await at(tNull), t: $staleAt(staleDate) }),
  ).toBeTruthy();
  expect(
    await Test.findOne({
      _id: await at(tooStaleDate),
      t: $staleAt(staleDate),
    }),
  ).toBeTruthy();
  expect(
    await Test.findOne({ _id: await at(staleDate), t: $staleAt(staleDate) }),
  ).toBeTruthy();
  expect(
    await Test.findOne({
      _id: await at(notStaleDate),
      t: $staleAt(staleDate),
    }),
  ).toBe(null);
});
it("stale", async () => {
  expect(
    await Test.findOne({ _id: await at(tNull), t: $stale("1d") }),
  ).toBeTruthy();
  expect(
    await Test.findOne({ _id: await at(tooStaleDate), t: $stale("1d") }),
  ).toBeTruthy();
  expect(
    await Test.findOne({ _id: await at(staleDate), t: $stale("1d") }),
  ).toBeTruthy();
  expect(
    await Test.findOne({ _id: await at(notStaleDate), t: $stale("1d") }),
  ).toBe(null);
});

it("freshAt", async () => {
  expect(
    await Test.findOne({ _id: await at(tNull), t: $freshAt(freshDate) }),
  ).toBeNull();
  expect(
    await Test.findOne({
      _id: await at(notFreshDate),
      t: $freshAt(freshDate),
    }),
  ).toBeNull();
  expect(
    await Test.findOne({ _id: await at(freshDate), t: $freshAt(freshDate) }),
  ).toBeTruthy();
  expect(
    await Test.findOne({
      _id: await at(tooFreshDate),
      t: $freshAt(freshDate),
    }),
  ).toBeTruthy();
});

it("fresh", async () => {
  expect(
    await Test.findOne({ _id: await at(tNull), t: $fresh("1d") }),
  ).toBeNull();
  expect(
    await Test.findOne({ _id: await at(notFreshDate), t: $fresh("1d") }),
  ).toBeNull();
  expect(
    await Test.findOne({ _id: await at(freshDate), t: $fresh("1d") }),
  ).toBeTruthy();
  expect(
    await Test.findOne({ _id: await at(tooFreshDate), t: $fresh("1d") }),
  ).toBeTruthy();
});

async function at(t?: Date): Promise<ObjectId> {
  return (await Test.insertOne({ t })).insertedId;
}
