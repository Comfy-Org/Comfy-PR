# Caching Strategy Analysis

**Severity: 🔴 High**

## Problem

The application has minimal caching at every layer — browser, CDN/edge, server, and database — despite serving data that changes infrequently (minutes to hours).

## Current State

### Layer 1: Browser / CDN Caching — ❌ None

- All dashboard pages use `force-dynamic`, which sets `Cache-Control: no-store` by default
- No `Cache-Control` headers are set on API responses
- tRPC responses have no caching headers
- The dump endpoints (`/api/dump.csv`, `/api/dump.yaml`) regenerate on every request

### Layer 2: Next.js ISR / Static Caching — ❌ Disabled

- `export const dynamic = "force-dynamic"` on 10+ pages disables all ISR/static generation
- `export const revalidate = 60` on the dashboard page is **overridden** by `force-dynamic` and has no effect
- No pages use static generation or `generateStaticParams`

### Layer 3: Server-Side Data Caching — ⚠️ Partial

| Data                           | Caching                                         | TTL             | Issue                                                              |
| ------------------------------ | ----------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| `analyzeTotals()`              | Via `updateComfyTotals()` → `Totals` collection | 30s fresh check | 30s is too short; combined with 1s polling = frequent cache misses |
| `analyzePullsStatus()`         | None                                            | —               | Recomputed on every request                                        |
| `getRepoUrls`                  | None                                            | —               | Full collection scan on every call                                 |
| GitHub API (`ghc`)             | SQLite via Keyv                                 | 5 min           | ✅ Good                                                            |
| `GithubContributorAnalyzeTask` | None                                            | —               | Full collection load on every call                                 |

### Layer 4: Database Query Caching — ⚠️ Indexes Only

- Performance indexes added for `SlackMsgs` and `CNRepos` (see `PERFORMANCE-FIXES.md`)
- No MongoDB query result caching
- No materialized views for expensive aggregations

---

## The 1-Second Polling Disaster

The worst performance issue is the combination of:

```
TotalsPage (refreshInterval=1000ms)
  → UseSWRComponent re-renders server component
    → TotalsBlock calls updateComfyTotals({ fresh: "30s" })
      → If cache miss: analyzeTotals() → 7 aggregation pipelines
      → If cache hit: MongoDB findOne on Totals collection
```

**Best case** (cache hit): 1 MongoDB query per second per client
**Worst case** (cache miss): 7 aggregation pipelines per second per client

With 10 users viewing the dashboard: **10-70 queries/second** hitting MongoDB.

---

## Recommended Caching Architecture

### Tier 1: Edge/CDN (Quick Win)

```ts
// Remove force-dynamic, use ISR
export const revalidate = 300; // 5 minutes
```

This alone would eliminate most server-side computation for repeated page loads.

### Tier 2: Server Response Cache

For tRPC endpoints, add a simple in-memory cache:

```ts
// Simple TTL cache for API responses
const responseCache = new Map<string, { data: unknown; expires: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = responseCache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data as Promise<T>;
  const promise = fn();
  promise.then((data) => responseCache.set(key, { data, expires: Date.now() + ttlMs }));
  return promise;
}
```

### Tier 3: Materialized Views

Pre-compute expensive aggregations on a schedule:

```ts
// Background job (every 5 minutes)
const totals = await analyzeTotals();
await DashboardTotals.updateOne(
  { _id: "current" },
  { $set: { data: totals, updatedAt: new Date() } },
  { upsert: true },
);

// Dashboard read (instant)
const totals = await DashboardTotals.findOne({ _id: "current" });
```

### Tier 4: Client-Side Stale-While-Revalidate

Change polling intervals:

| Component | Current | Recommended  |
| --------- | ------- | ------------ |
| Totals    | 1s      | 5 min (300s) |
| Details   | 60s     | 5 min (300s) |

---

## Implementation Priority

| Change                                            | Effort | Impact      | Priority |
| ------------------------------------------------- | ------ | ----------- | -------- |
| Change totals `refreshInterval` from 1s to 300s   | 1 line | 🔴 Critical | P0       |
| Increase `updateComfyTotals` fresh from 30s to 5m | 1 line | 🔴 High     | P0       |
| Remove `force-dynamic`, use `revalidate = 300`    | Low    | 🔴 High     | P1       |
| Add response caching to tRPC procedures           | Medium | 🟡 Medium   | P2       |
| Materialize `analyzePullsStatus` results          | Medium | 🟡 Medium   | P2       |
| Add `Cache-Control` headers to dump endpoints     | Low    | 🟡 Medium   | P2       |

## Quick Fix (2 Lines)

The single highest-impact change is:

```diff
// app/(dashboard)/totals/page.tsx
-    <UseSWRComponent props={{}} Component={TotalsBlock} refreshInterval={1e3}>
+    <UseSWRComponent props={{}} Component={TotalsBlock} refreshInterval={300e3}>
```

```diff
// src/updateComfyTotals.ts
-export async function updateComfyTotals({ notify = true, fresh = "30m" } = {}) {
+export async function updateComfyTotals({ notify = true, fresh = "5m" } = {}) {
```

These two changes would reduce database load by **~99%** for dashboard views.
