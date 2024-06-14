import { $flatten } from "./$flatten";

it("should flatten the object", () => {
  const result = $flatten({
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
    $flatten({
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
    $flatten({
      $or: [{ a: { b: "c" } }, { b: 2 }],
    }),
  ).toEqual({
    $or: [{ "a.b": "c" }, { b: 2 }],
  });
});
