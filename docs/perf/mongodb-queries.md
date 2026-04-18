# MongoDB Query Performance Bottlenecks

**Severity: 🔴 High**

## Problem

The application runs several expensive MongoDB aggregation pipelines on every page load, with inadequate indexing and no result-level caching for the most expensive queries.

## Bottleneck 1: `analyzeTotals()` — 7 Parallel Full-Collection Scans

**File:** `src/analyzeTotals.ts`

### What It Does

`analyzeTotals()` runs 7 parallel aggregation pipelines on the `CNRepos` collection using `promiseAllProperties()`:

1. `Total Nodes` — 3 queries on `CMNodes` and `CRNodes`
2. `Total Repos` — `$group` over entire `CNRepos` with conditional sums
3. `Total Authors` — `$match` → `$group` → `$group` (double grouping)
4. `Total PRs Made` — `$unwind("$crPulls.data")` → `$group` → `$group`
5. `Total Open` — Same `$unwind` + `$match` + double `$group`
6. `Total Merged (on Registry)` — Same pattern with `cr: { $exists: true }` filter
7. `Total Merged (not on Registry)` / `Total Closed` — Same pattern

### Why It's Slow

- **Every pipeline does a full collection scan** of `CNRepos` (~5,000 docs).
- **`$unwind("$crPulls.data")`** explodes documents — if each repo has 5 PRs, a 5,000-doc collection becomes 25,000 intermediate docs.
- **Double `$group` pattern** (group → set → group again to merge key-value pairs) is an anti-pattern that doubles memory/CPU.
- **No caching** at the aggregation level — results change slowly but are recomputed every request.

### Impact

- Estimated **420ms+ per pipeline × 7 = ~3 seconds** of MongoDB CPU per dashboard load.
- With `UseSWRComponent refreshInterval={1e3}` on the totals page, this fires **every second per connected client**.

### Fix

1. **Cache results** in a `Totals` collection (partially done via `updateComfyTotals`) but the 30-second freshness window combined with 1s polling means most requests still hit the DB.
2. **Increase cache TTL** — totals change at most every few minutes; use 5-minute caching.
3. **Consolidate pipelines** — run a single `$facet` aggregation instead of 7 separate pipelines.
4. **Pre-compute** totals in a background job and serve from cache.

---

## Bottleneck 2: `analyzePullsStatus()` — Deep Pipeline with `$lookup`

**File:** `src/analyzePullsStatus.ts`

### What It Does

Builds a complex pipeline:
1. `$set` to compute `latest_comment_at`
2. `$unwind("$crPulls.data")` — explodes array
3. `$match` for comments
4. Multiple `$set` stages to reshape
5. `$replaceRoot` — flattens structure
6. `$lookup("Authors")` — cross-collection join
7. `$unwind("$author")`
8. `$lookup("EmailTasks")` — another cross-collection join
9. `$unwind("$emailTask")`
10. Multiple `$set`, `$project`, `$sort` stages

### Why It's Slow

- **Two `$lookup` stages** (Authors, EmailTasks) are essentially nested-loop joins — each document triggers a secondary query.
- **No index** on `Authors.githubId` for the lookup join key (not visible in the codebase).
- **Full result set** loaded into memory via `.toArray()` with default `limit = 0` (meaning 2^31 - 1).
- The **`/details` page** calls this with `limit=0` (all records), loading every PR status into server memory.

### Impact

- Estimated **1-5 seconds per call** depending on collection sizes.
- The `/details` page uses `UseSWRComponent refreshInterval={60e3}` — better than totals, but still re-runs the full pipeline every minute per client.

### Fix

1. **Add index** on `Authors.githubId` for the `$lookup`.
2. **Paginate** — enforce a reasonable default limit (e.g., 50).
3. **Cache the rendered result** with a TTL of 1-5 minutes.
4. **Materialize** the view into a `DashboardDetails` collection (already defined but unused).

---

## Bottleneck 3: Missing Indexes (Partially Fixed)

**File:** `PERFORMANCE-FIXES.md`, `src/CNRepos.ts`, `lib/slack/SlackMsgs.ts`

These were identified by MongoDB Atlas Performance Advisor:

| Collection | Issue | Status |
|---|---|---|
| `SlackMsgs` | Missing `{ status: 1, mtime: 1 }` index — 80,501 doc scans | ✅ Index added |
| `CNRepos` | Missing compound `idx_states_mtimes` index — 4,998 doc scans | ✅ Index added |
| `Authors` | Missing `githubId` index for `$lookup` joins | ❌ Not addressed |
| `EmailTasks` | Missing `_id` index usage in `$lookup` | ⚠️ Uses `_id` (OK) |

### Remaining Gap

The `Authors.githubId` lookup index is critical for the `analyzePullsStatus` pipeline performance but is not present in the codebase.

---

## Bottleneck 4: Unbounded tRPC Queries

**File:** `app/api/router.ts`

```ts
// Line 90 — loads ALL contributor analyze tasks into memory
return await GithubContributorAnalyzeTask.find({}).toArray();

// Line 54 — loads ALL repo URLs into memory
return await sflow(CNRepos.find({}, { projection: { repository: 1 } }))
  .map(...)
  .toArray();
```

### Fix

- Add pagination (`skip`/`limit`) to all tRPC queries.
- Use cursor-based pagination for large collections.

---

## Summary of Fixes

| Fix | Effort | Impact |
|---|---|---|
| Increase totals cache TTL to 5 min | Low | 🔴 High — eliminates per-second DB hits |
| Consolidate `analyzeTotals` into `$facet` | Medium | 🔴 High — 7× fewer pipelines |
| Add `Authors.githubId` index | Low | 🟡 Medium — speeds up `$lookup` |
| Paginate tRPC queries | Low | 🟡 Medium — prevents OOM on large datasets |
| Materialize `DashboardDetails` | Medium | 🔴 High — eliminates expensive pipeline |
