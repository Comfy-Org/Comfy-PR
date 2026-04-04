# QA Bot — Multi-Repository Support

## Overview

QA Bot is designed to work with **any frontend repository** under Comfy-Org, not just ComfyUI_frontend. Each repo has different tech stacks, startup procedures, and testing conventions.

---

## Supported Repositories

### Tier 1 — Full Support (Day 1)

| Repository | Stack | Dev Server | Port | Notes |
|---|---|---|---|---|
| `Comfy-Org/ComfyUI_frontend` | Vue 3 + Vite | `npm run dev` | 5173 | Canvas-based UI, needs mock backend |
| `Comfy-Org/desktop` | Electron + Vue | `npm run dev` | 5173 | Desktop app, Electron-specific tests |

### Tier 2 — Planned Support

| Repository | Stack | Dev Server | Port | Notes |
|---|---|---|---|---|
| `Comfy-Org/registry` | Next.js | `npm run dev` | 3000 | Standard web app |
| `Comfy-Org/docs` | Next.js / Docusaurus | `npm run dev` | 3000 | Documentation site |
| `Comfy-Org/cloud` | Next.js | `npm run dev` | 3000 | Cloud service dashboard |

### Tier 3 — Generic Support

Any web-based project with auto-detection:

- Vite projects (detect `vite.config.*`)
- Next.js projects (detect `next.config.*`)
- Create React App (detect `react-scripts` in package.json)
- Nuxt (detect `nuxt.config.*`)
- Generic (detect `package.json` with `dev` script)

---

## App Bootstrap System

### Auto-Detection

```typescript
// bot/qa/bootstrap/index.ts
const bootstrappers: AppBootstrap[] = [
  comfyuiFrontendBootstrap,   // Most specific first
  comfyuiDesktopBootstrap,
  nextjsBootstrap,
  viteBootstrap,
  genericBootstrap,           // Fallback
];

export async function detectBootstrap(repoDir: string): Promise<AppBootstrap> {
  for (const bootstrap of bootstrappers) {
    if (await bootstrap.detect(repoDir)) {
      return bootstrap;
    }
  }
  throw new Error(`No bootstrap found for repo at ${repoDir}`);
}
```

### ComfyUI Frontend Bootstrap

The frontend needs a **mock ComfyUI backend** since it's just the UI layer:

```typescript
// bot/qa/bootstrap/comfyui-frontend.ts
export const comfyuiFrontendBootstrap: AppBootstrap = {
  name: 'comfyui-frontend',

  detect: async (dir) => {
    const pkg = await readJSON(path.join(dir, 'package.json'));
    return pkg.name === '@comfyorg/comfyui-frontend';
  },

  install: async (dir) => {
    await $`cd ${dir} && npm install`;
    await $`cd ${dir} && npx playwright install chromium`;
  },

  start: async (dir) => {
    // Option A: Start with mock backend
    const mockServer = spawn('node', ['tests/mock-server.js'], { cwd: dir });

    // Option B: Start with real ComfyUI backend (if available)
    // const backend = spawn('python', ['main.py'], { cwd: comfyuiDir });

    const devServer = spawn('npm', ['run', 'dev'], {
      cwd: dir,
      env: { ...process.env, VITE_COMFYUI_URL: 'http://localhost:8188' },
    });

    return { processes: [mockServer, devServer], cleanup: () => { ... } };
  },

  readyCheck: async (url) => {
    const res = await fetch(url).catch(() => null);
    return res?.ok ?? false;
  },

  baseUrl: 'http://localhost:5173',
};
```

### ComfyUI Desktop Bootstrap

Desktop app requires Electron-specific handling:

```typescript
export const comfyuiDesktopBootstrap: AppBootstrap = {
  name: 'comfyui-desktop',

  detect: async (dir) => {
    const pkg = await readJSON(path.join(dir, 'package.json'));
    return pkg.name === '@comfyorg/desktop' || existsSync(path.join(dir, 'electron'));
  },

  start: async (dir) => {
    // Use Playwright's Electron support
    const electronApp = await electron.launch({
      args: [path.join(dir, 'main.js')],
    });
    const page = await electronApp.firstWindow();
    return { electronApp, page };
  },

  baseUrl: 'electron://app',
};
```

---

## Per-Repo QA Configuration

Repos can optionally include a `.qabot.yaml` configuration:

```yaml
# .qabot.yaml (in target repo root)
bootstrap:
  install: "npm ci"
  start: "npm run dev"
  port: 5173
  ready_path: "/"
  ready_timeout: 120

mock:
  backend: "node tests/mock-server.js"
  backend_port: 8188

test:
  framework: "playwright"
  config: "playwright.config.ts"
  fixtures:
    - "tests/fixtures/ComfyPage.ts"

video:
  resolution: "1920x1080"
  fps: 30

routes:
  - name: "Home"
    path: "/"
    tests:
      - "Canvas renders"
      - "Menu bar visible"
  - name: "Templates"
    path: "/templates"
    tests:
      - "Template gallery loads"
      - "Template preview works"
  - name: "Settings"
    path: "/settings"
    tests:
      - "Settings page renders"
      - "Theme toggle works"
```

If no `.qabot.yaml` exists, QA Bot uses auto-detection.

---

## Backend Dependencies

### ComfyUI Frontend → ComfyUI Backend

The frontend needs a ComfyUI backend to function. Options:

1. **Mock Server** (preferred for QA): Lightweight mock that returns fixture data
2. **Real Backend**: Spin up actual ComfyUI Python server (heavy, but accurate)
3. **Recorded Responses**: Replay recorded API responses (fast, deterministic)

```typescript
type BackendStrategy = 'mock' | 'real' | 'replay';

async function setupBackend(strategy: BackendStrategy, repoDir: string) {
  switch (strategy) {
    case 'mock':
      return spawnMockServer(repoDir);
    case 'real':
      return spawnRealComfyUI();
    case 'replay':
      return spawnReplayServer(path.join(repoDir, 'tests/fixtures/api-recordings'));
  }
}
```

---

## Adding Support for a New Repo

To add QA support for a new repository:

1. **Create bootstrap** in `bot/qa/bootstrap/<repo-name>.ts`:
   - Implement `AppBootstrap` interface
   - Handle install, start, ready check, cleanup

2. **Register** in `bot/qa/bootstrap/index.ts`:
   - Add to the bootstrappers array (more specific = earlier in list)

3. **Test locally**:
   ```bash
   prbot qa smoke --repo=Comfy-Org/<new-repo> --branch=main
   ```

4. **Optional**: Add `.qabot.yaml` to the target repo for custom configuration
