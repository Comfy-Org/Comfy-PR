import type { AppBootstrap } from "./types";
import { comfyuiFrontendBootstrap } from "./comfyui-frontend";
import { genericViteBootstrap } from "./generic-vite";
import { genericNextjsBootstrap } from "./generic-nextjs";

/** Ordered list — more specific detectors first. */
const bootstrappers: AppBootstrap[] = [
  comfyuiFrontendBootstrap,
  genericNextjsBootstrap,
  genericViteBootstrap,
];

/**
 * Auto-detect the correct bootstrap for a cloned repo directory.
 * Tries each detector in order, returning the first match.
 */
export async function detectBootstrap(repoDir: string): Promise<AppBootstrap> {
  for (const b of bootstrappers) {
    if (await b.detect(repoDir)) return b;
  }
  throw new Error(
    `No bootstrap detected for ${repoDir}. ` +
      `Supported: ${bootstrappers.map((b) => b.name).join(", ")}. ` +
      `Add a .qabot.yaml or a new bootstrap module.`,
  );
}

export { comfyuiFrontendBootstrap, genericViteBootstrap, genericNextjsBootstrap };
export type { AppBootstrap, AppProcess } from "./types";
