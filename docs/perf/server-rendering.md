# Server-Side Rendering Bottlenecks

**Severity: 🟡 Medium**

## Problem

The application overuses `force-dynamic` rendering and has suboptimal data-fetching patterns that prevent Next.js from caching or statically generating any pages.

## All Pages Are `force-dynamic`

**10+ routes** export `dynamic = "force-dynamic"`:

| Route | File |
|---|---|
| `/` (dashboard) | `app/(dashboard)/page.tsx` |
| `/details` | `app/(dashboard)/details/page.tsx` |
| `/totals` | `app/(dashboard)/totals/page.tsx` |
| `/rules` | `app/(dashboard)/rules/page.tsx` |
| `/rules/[name]` | `app/(dashboard)/rules/[name]/page.tsx` |
| `/followup/actions/send-gmail` | `app/(dashboard)/followup/actions/send-gmail/page.tsx` |
| `/tasks` | `app/tasks/page.tsx` |
| `/tasks/gh-design` | `app/tasks/gh-design/page.tsx` |
| `/api/trpc/[trpc]` | `app/api/trpc/[trpc]/route.ts` |
| `/api/dump.csv` | `app/api/(dump)/dump.csv/route.ts` |
| `/api/dump.yaml` | `app/api/(dump)/dump.yaml/route.ts` |

### Why This Is a Problem

- `force-dynamic` means **every request triggers a full server render** — no static HTML, no ISR, no edge caching.
- For a dashboard that changes at most every few minutes, this is extremely wasteful.
- Combined with the expensive MongoDB aggregations, each page load takes **3-10 seconds** of server-side computation.

### Fix (Applied)

Pages that directly access MongoDB at render time still need `force-dynamic` because the build-time DB proxy cannot handle collection queries. However:
1. Pages that don't access DB (e.g., `/totals`, `/details` using `UseSWRComponent`) had `force-dynamic` removed and are now statically prerendered.
2. DB-accessing pages retain `force-dynamic` but now also declare `revalidate = 300` for when ISR can be enabled in the future (e.g., after migrating to API-driven data fetching).

---

## `UseSWRComponent` Polling Pattern

**Files:**
- `app/(dashboard)/totals/page.tsx` — `refreshInterval={1e3}` (1 second!)
- `app/(dashboard)/details/page.tsx` — `refreshInterval={60e3}` (1 minute)

### How It Works

`UseSWRComponent` from `use-swr-component` is a pattern that:
1. Server-renders the component on first load
2. Then client-side polls the server component endpoint at `refreshInterval`

### Problem: 1-Second Polling on Totals

The totals page polls **every 1 second**. Each poll:
1. Makes an HTTP request to the server
2. Server re-renders the `TotalsBlock` component
3. `TotalsBlock` calls `updateComfyTotals({ fresh: "30s" })` 
4. If cache is stale (>30s), runs `analyzeTotals()` — 7 parallel aggregation pipelines
5. Returns the full HTML

With even 5 concurrent users, this means **5 requests/second** to the server, each potentially triggering expensive DB queries.

### Fix (Applied)

1. ✅ Increased `refreshInterval` from `1e3` (1s) to `300e3` (5 min) on totals page.
2. ✅ Increased `refreshInterval` from `60e3` (1 min) to `300e3` (5 min) on details page.
3. ✅ Increased cache freshness in `TotalsBlock` from `"30s"` to `"5m"`.

---

## Dashboard Page Loads Two Heavy Components in Sequence

**File:** `app/(dashboard)/page.tsx`

```tsx
export default async function DashboardPage() {
  return (
    <main className="flex flex-wrap">
      <TotalsPage />        {/* ← analyzeTotals() */}
      <LatestDetails />     {/* ← analyzePullsStatus(limit=20) */}
    </main>
  );
}
```

Both are async server components, but `TotalsPage` uses `UseSWRComponent` so it renders a loading state quickly. The real concern is `LatestDetails` which calls `analyzePullsStatus({ limit: 20 })` directly — a heavy pipeline even with limit=20 because the pipeline does `$unwind` + `$lookup` before applying the limit.

### Fix

- Move the `$match` and `$limit` stages **before** `$lookup` in the pipeline to reduce the number of documents that need cross-collection joins.
- Wrap `LatestDetails` in `<Suspense>` (already done ✅) with a meaningful fallback.

---

## `revalidate = 60` Overridden by `force-dynamic`

**File:** `app/(dashboard)/page.tsx`

```ts
export const dynamic = "force-dynamic";
export const revalidate = 60; // seconds  ← THIS IS IGNORED
```

`force-dynamic` takes precedence over `revalidate`. The `revalidate = 60` has no effect.

### Fix (Applied)

`revalidate` increased from `60` to `300`. `force-dynamic` retained because the page accesses MongoDB at render time.
