import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import type { AppBootstrap, AppProcess } from "./types";

export const comfyuiFrontendBootstrap: AppBootstrap = {
  name: "comfyui-frontend",
  defaultBaseUrl: "http://localhost:5173",

  async detect(repoDir) {
    try {
      const pkg = JSON.parse(await readFile(path.join(repoDir, "package.json"), "utf-8"));
      return (
        pkg.name === "@comfyorg/comfyui-frontend" ||
        pkg.name === "comfyui-frontend" ||
        existsSync(path.join(repoDir, "src/components/node"))
      );
    } catch {
      return false;
    }
  },

  async install(repoDir) {
    const proc = spawn("npm", ["ci"], { cwd: repoDir, stdio: "inherit" });
    await new Promise<void>((resolve, reject) => {
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`npm ci exited ${code}`))));
    });

    const pwProc = spawn("npx", ["playwright", "install", "chromium"], { cwd: repoDir, stdio: "inherit" });
    await new Promise<void>((resolve, reject) => {
      pwProc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`playwright install exited ${code}`))));
    });
  },

  async start(repoDir) {
    const processes: ChildProcess[] = [];

    const devServer = spawn("npm", ["run", "dev"], {
      cwd: repoDir,
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    });
    processes.push(devServer);

    const cleanup = async () => {
      for (const p of processes) {
        p.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 1000));
        if (!p.killed) p.kill("SIGKILL");
      }
    };

    return { processes, baseUrl: this.defaultBaseUrl, cleanup };
  },

  async readyCheck(url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  },
};
