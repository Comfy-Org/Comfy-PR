# Client Bundle Size Bottlenecks

**Severity: 🔴 High**

## Problem

Several very large libraries are imported directly into client-side components (`"use client"`) without dynamic imports or code-splitting. This inflates the initial JS bundle served to browsers, increasing Time-to-Interactive (TTI) and Largest Contentful Paint (LCP).

## Affected Components

### 1. Monaco Editor (~4 MB uncompressed)

**File:** `components/CodeEditor.tsx`

```ts
"use client";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";  // ← full editor core, ~4 MB
loader.config({ monaco });
import Editor from "@monaco-editor/react";
```

**Problem:** `import * as monaco from "monaco-editor"` pulls the entire Monaco core into the client bundle. The `@monaco-editor/react` package already lazy-loads Monaco from a CDN by default — configuring it with the local `monaco-editor` defeats that optimization.

**Fix:**
- Remove `import * as monaco from "monaco-editor"` and the `loader.config({ monaco })` line. Let `@monaco-editor/react` load Monaco from CDN.
- Or use `next/dynamic` with `{ ssr: false }` to lazy-load the entire `CodeEditor` component.

### 2. ECharts (~1 MB)

**Files:**
- `app/(dashboard)/TotalsChart.tsx`
- `app/tasks/github-action-update/ProgressBarChart.tsx`

```ts
"use client";
import { EChart } from "@kbox-labs/react-echarts";
```

**Problem:** ECharts is a very large charting library. It's imported eagerly in client components that may not even be visible on initial load.

**Fix:**
- Use `next/dynamic(() => import('./TotalsChart'), { ssr: false })` in the parent.
- Consider using a lighter chart library (e.g., `recharts`, `lightweight-charts`) for simple line/bar charts.
- If ECharts is needed, use tree-shakeable imports: `import * as echarts from 'echarts/core'` with only required chart types.

### 3. D3 (~500 KB full import)

**Files:**
- `app/(dashboard)/PullsStatusTable.tsx` — `import { csvFormat, csvParse } from "d3"`
- `app/tasks/github-contributor-analyze/page.tsx` — `import * as d3 from "d3"`

**Problem:** `import * as d3 from "d3"` or even named imports from `"d3"` pull the entire D3 library because the root `d3` package is a re-export barrel.

**Fix:**
- Import sub-modules directly: `import { csvFormat, csvParse } from "d3-dsv"` (~15 KB instead of ~500 KB).
- The contributor analyze page is a server component — ensure `d3` isn't leaking into the client bundle via shared modules.

### 4. react-diff-view

**File:** `app/tasks/github-action-update/GitDIffResult.tsx`

```ts
"use client";
import { Diff, Hunk, parseDiff } from "react-diff-view";
```

**Fix:** Lazy-load with `next/dynamic` since diff viewing is not needed on initial render.

### 5. react-icons (barrel import risk)

**File:** `app/auth/login/page.tsx`

```ts
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
```

**Risk:** `react-icons` v5 uses per-icon entry points (`react-icons/fa`), but the barrel file for the `fa` set still contains all Font Awesome icons. Webpack may not tree-shake effectively.

**Fix:** Use specific deep imports or replace with inline SVGs / `lucide-react` icons (already a dependency).

## Measurement

Enable the Next.js bundle analyzer to quantify:

```bash
# Already in devDependencies: @next/bundle-analyzer
ANALYZE=true bun run build
```

Add to `next.config.ts`:

```ts
import bundleAnalyzer from "@next/bundle-analyzer";
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
export default withBundleAnalyzer(nextConfig);
```

## Expected Impact

| Change | Estimated Bundle Reduction |
|---|---|
| Fix Monaco import | ~4 MB → ~0 (CDN-loaded) |
| Lazy-load ECharts | ~1 MB deferred |
| Use d3-dsv instead of d3 | ~485 KB saved |
| Lazy-load react-diff-view | ~200 KB deferred |
| **Total** | **~5.5 MB+ reduction** |
