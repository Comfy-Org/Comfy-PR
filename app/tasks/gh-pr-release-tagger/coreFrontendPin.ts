/**
 * Read the frontend version a ComfyUI release pins in its requirements.txt
 * (`comfyui-frontend-package==1.59.6`) and name the frontend release branch
 * that version was cut from (`core/1.59`).
 *
 * Desktop installs ComfyUI's requirements, so this pin is what both core and
 * Desktop users run. Returns null when the file has no exact pin.
 */
export function coreFrontendPin(requirements: string): { tag: string; branch: string } | null {
  const match = requirements.match(/^\s*comfyui[-_]frontend[-_]package\s*==\s*v?(\d+)\.(\d+)\.(\d+)\s*(?:#.*)?$/im);
  if (!match) return null;
  const [, major, minor, patch] = match;
  return { tag: `v${major}.${minor}.${patch}`, branch: `core/${major}.${minor}` };
}
