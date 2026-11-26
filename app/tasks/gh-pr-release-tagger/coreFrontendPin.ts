/** Parse the exact `comfyui-frontend-package==X.Y.Z` pin into its tag and `core/X.Y` branch; null if none. */
export function coreFrontendPin(requirements: string): { tag: string; branch: string } | null {
  const match = requirements.match(/^\s*comfyui[-_]frontend[-_]package\s*==\s*v?(\d+)\.(\d+)\.(\d+)\s*(?:#.*)?$/im);
  if (!match) return null;
  const [, major, minor, patch] = match;
  return { tag: `v${major}.${minor}.${patch}`, branch: `core/${major}.${minor}` };
}
