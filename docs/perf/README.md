# Performance Analysis

This directory contains detailed bottleneck analysis for the Comfy-PR site.

## Documents

| Document | Area | Severity |
|---|---|---|
| [client-bundle.md](./client-bundle.md) | Client-side JS bundle size | 🔴 High |
| [mongodb-queries.md](./mongodb-queries.md) | Database query performance | 🔴 High |
| [server-rendering.md](./server-rendering.md) | SSR & data-fetching patterns | 🟡 Medium |
| [dependency-bloat.md](./dependency-bloat.md) | Excessive dependencies | 🟡 Medium |
| [build-and-typecheck.md](./build-and-typecheck.md) | Build & TypeScript compilation | 🟢 Mitigated |
| [trpc-api.md](./trpc-api.md) | tRPC API layer inefficiencies | 🟡 Medium |
| [caching-strategy.md](./caching-strategy.md) | Missing/ineffective caching | 🔴 High |

## Summary of Top Bottlenecks

1. **Heavy client bundles** — Monaco Editor (~4 MB), ECharts (~1 MB), D3 (~500 KB), react-diff-view pulled into client JS with no code-splitting or lazy-loading.
2. **Unbounded MongoDB aggregations** — `analyzeTotals()` fires 7 parallel full-collection-scan aggregations on every dashboard load. `analyzePullsStatus()` does multi-`$unwind` + `$lookup` pipelines with no result caching.
3. **No SSR caching / over-reliance on `force-dynamic`** — 10+ pages use `export const dynamic = "force-dynamic"`, bypassing Next.js static/ISR optimizations entirely.
4. **Totals polling at 1 s interval** — `UseSWRComponent` with `refreshInterval={1e3}` on the dashboard causes a server-side `analyzeTotals()` call every second per connected client.
5. **127+ production dependencies** — many heavy or unused packages shipped to the server bundle, increasing cold-start time on Vercel.
