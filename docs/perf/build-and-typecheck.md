# Build & TypeScript Compilation Performance

**Severity: 🟢 Mitigated (previously 🔴 High)**

## Historical Problem (PR #139)

The TypeScript server previously experienced severe slowdowns and crashes due to:

1. **Overly broad `include` pattern** (`**/*.ts`) in `tsconfig.json` — forced scanning of 15,355+ `.d.ts` files in `node_modules`
2. **Expensive recursive type** (`DeepAsyncWrapper<T>`) in `src/ghc.ts` — computed over 122K+ line Octokit type definitions
3. **Test files included** in compilation — unnecessary type checking during development

## Current State (Mitigated)

### tsconfig.json — Now Uses Specific Includes

```json
{
  "include": [
    "app/**/*.ts",
    "app/**/*.tsx",
    "bot/**/*.ts",
    "bot/**/*.tsx",
    "components/**/*.ts",
    "components/**/*.tsx",
    "gh-service/**/*.ts",
    "lib/**/*.ts",
    "lib/**/*.tsx",
    "packages/**/*.ts",
    "run/**/*.ts",
    "scripts/**/*.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    "reports/**/*.ts",
    "*.ts",
    "*.tsx",
    "next-env.d.ts"
  ],
  "exclude": [
    "node_modules",
    "**/node_modules",
    ".next",
    ".cache",
    "dist",
    "prs",
    "repos",
    "scripts",
    "**/*.spec.ts",
    "**/*.test.ts"
  ]
}
```

### What's Working

- TypeScript compilation completes in ~33s with clean builds
- Test files excluded from compilation
- `skipLibCheck: true` avoids checking `node_modules` `.d.ts` files
- `ignoreBuildErrors: true` in `next.config.ts` allows builds to succeed even with type errors
- `tsgo` (native TypeScript) is available for faster type-checking

### Remaining Concerns

1. **`packages/**/\*.ts`include** — if workspace packages have their own`node_modules`, those `.ts` files could be scanned
2. **`scripts` in both include and exclude** — `scripts/**/*.ts` is included, but `scripts` is also excluded. The exclude takes precedence, which means scripts aren't type-checked. This is inconsistent.
3. **Build memory** — `NODE_OPTIONS: "--max-old-space-size=4096"` in `vercel.json` indicates the build still needs 4 GB RAM, suggesting the webpack bundling itself is memory-heavy (likely due to the large dependency tree).

## Build Configuration

```ts
// next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { fs: false, net: false, tls: false };
    }
    return config;
  },
};
```

### Analysis

- `output: "standalone"` — good for Vercel deployment, traces only needed files
- `ignoreBuildErrors: true` — skips type checking during build (faster builds, but risky)
- No Turbopack enabled — could significantly speed up dev server
- No bundle analyzer configured — should enable `@next/bundle-analyzer` (already in devDeps)
- Not using Next.js 15 `turbo` dev mode

## Recommendations

| Fix                                            | Effort | Impact                       |
| ---------------------------------------------- | ------ | ---------------------------- |
| Enable Turbopack for dev (`next dev --turbo`)  | Low    | Fast HMR improvements        |
| Configure `@next/bundle-analyzer`              | Low    | Visibility into bundle sizes |
| Resolve `scripts` include/exclude conflict     | Low    | Code hygiene                 |
| Upgrade to `next build --turbo` (experimental) | Low    | Faster production builds     |
