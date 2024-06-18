import { $fresh, $stale } from ".";
import { $elemMatch } from "./$elemMatch";
import { $filaten } from "./$filaten";

it("should flatten the object", () => {
  const result = $filaten({
    nested: { hello: "world" }, // never created
  });
  const expected = {
    "nested.hello": "world",
  };
  expect(result).toEqual(expected);
});

it("should not flatten $", () => {
  const date = new Date();

  // $fresh is not flattened
  expect(
    $filaten({
      candidate: { mtime: { $gt: date }, state: "ok", data: { $eq: true } },
      createdPulls: { $exists: false },
    }),
  ).toEqual({
    "candidate.mtime": { $gt: date },
    "candidate.state": "ok",
    "candidate.data": { $eq: true },
    createdPulls: { $exists: false },
  });

  // $or is not flattened, but its children are
  expect(
    $filaten({
      $or: [{ a: { b: "c" } }, { b: 2 }],
    }),
  ).toEqual({
    $or: [{ "a.b": "c" }, { b: 2 }],
  });
});

it("should flatten through $ into deeper", () => {
  const templateOutdate = new Date("2024-06-13T09:02:56.630Z");
  const $match = $filaten({
    crPulls: {
      data: $elemMatch({
        pull: {
          updated_at: {
            $lte: templateOutdate.toISOString().replace(/.\d\d\dZ/, "Z"),
          },
        },
      }),
    },
  });
  expect($match).toEqual({
    // flattened
    "crPulls.data": {
      // not flattened
      $elemMatch: {
        // flattened
        "pull.updated_at": {
          $lte: "2024-06-13T09:02:56Z",
        },
      },
    },
  });
});

it("should flatten deep", () => {
  const date = new Date();
  expect(
    $filaten({
      pulls: { mtime: { $gte: date }, nested: { data: { $exists: true } } },
      crPulls: { mtime: { $not: { $gte: date } } },
    }),
  ).toEqual({
    "pulls.mtime": { $gte: date },
    "pulls.nested.data": { $exists: true },
    "crPulls.mtime": { $not: { $gte: date } },
  });
});

it("don't destroy date obj", () => {
  jest.useFakeTimers().setSystemTime(new Date());
  expect(
    $filaten({
      pulls: { mtime: $fresh("0s") },
      crPulls: { mtime: $stale("0s") },
    }),
  ).toEqual({
    "pulls.mtime": $fresh("0s"),
    "crPulls.mtime": $stale("0s"),
  });
});
