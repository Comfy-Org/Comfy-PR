# tRPC API Layer Bottlenecks

**Severity: 🟡 Medium**

## Problem

The tRPC API layer has several inefficiencies related to unbounded queries, lack of pagination, and unnecessary data loading.

## Bottleneck 1: Unbounded `getRepoUrls` Query

**File:** `app/api/router.ts` (line 47-58)

```ts
getRepoUrls: t.procedure
  .query(async () => {
    const { CNRepos } = await import("@/src/CNRepos");
    return await sflow(CNRepos.find({}, { projection: { repository: 1 } }))
      .map((e) => e.repository)
      .filter((repo) => typeof repo === "string" && repo.length > 0)
      .toArray();
  }),
```

### Issue
- Loads **all ~5,000 repository URLs** into memory on every call
- No pagination, no caching
- The entire array is serialized to JSON and sent over the wire

### Fix
- Add `skip`/`limit` pagination
- Cache the result (repo URLs change rarely)

---

## Bottleneck 2: Unbounded `GithubContributorAnalyzeTask` Query

**File:** `app/api/router.ts` (line 87-91)

```ts
GithubContributorAnalyzeTask: t.procedure
  .query(async () => {
    return await GithubContributorAnalyzeTask.find({}).toArray();
  }),
```

### Issue
- Loads **all contributor analysis records** into memory
- No limit, no pagination
- Each record contains nested `contributors` arrays, amplifying payload size

### Fix
- Add `limit` parameter (default 50)
- Only return summary data, not full contributor lists
- Add cursor-based pagination

---

## Bottleneck 3: `analyzePullsStatus` Default Limit

**File:** `app/api/router.ts` (line 37-46)

```ts
analyzePullsStatus: t.procedure
  .input(z.object({ skip: z.number(), limit: z.number() }).partial())
  .query(async ({ input: { limit = 0, skip = 0 } }) => {
    return await analyzePullsStatus({ limit, skip });
  }),
```

### Issue
- `limit` defaults to `0`, which in the pipeline means `2^31 - 1` (all records)
- Callers who forget to pass `limit` get the entire dataset
- The pipeline runs `$unwind` + `$lookup` before `$limit` is applied

### Fix
- Change default `limit` to `50`
- Enforce a maximum limit (e.g., 500)

---

## Bottleneck 4: Dynamic Imports in Hot Paths

Several tRPC procedures use dynamic `import()` inside the query handler:

```ts
.query(async () => {
  const { analyzePullsStatus } = await import("@/src/analyzePullsStatus");
  // ...
})
```

### Issue
- Dynamic imports add latency on **every cold call** (module parsing + initialization)
- On Vercel serverless, each cold start pays this cost

### Analysis
This is actually a reasonable pattern to avoid loading heavy modules into the tRPC route handler's initial bundle. The tradeoff is acceptable, but could be improved with module-level caching or pre-warming.

---

## Bottleneck 5: No Response Caching

None of the tRPC procedures implement caching. For read-heavy dashboard queries that change infrequently, this means every request hits the database.

### Fix
- Use `@trpc/server` middleware for response caching
- Or implement caching at the data layer (MongoDB result caching)

Example middleware:

```ts
const cachedProcedure = t.procedure.use(async ({ next, path }) => {
  const cached = await cache.get(path);
  if (cached) return cached;
  const result = await next();
  await cache.set(path, result, { ttl: 300 }); // 5 min
  return result;
});
```

---

## Summary

| Issue | Fix | Impact |
|---|---|---|
| `getRepoUrls` unbounded | Add pagination + cache | 🟡 Medium |
| `GithubContributorAnalyzeTask` unbounded | Add limit + pagination | 🟡 Medium |
| `analyzePullsStatus` default limit=0 | Default to 50, max 500 | 🔴 High |
| No response caching | Add TTL-based caching | 🔴 High |
