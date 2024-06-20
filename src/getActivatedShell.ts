import { $ as zx } from "zx";
import { getActivateCMD } from "./cli/getActivateCMD";

if (import.meta.main) {
  // await checkComfyActivated();
  zx.verbose = true;
  const $ = getActivatedShell();
  const p = await $`comfy-cli --version`;
  console.log(p.stdout);
  // zx({ prefix:  })`comfy-cli --help`;
}

export function getActivatedShell() {
  const activate = getActivateCMD();
  return zx({
    prefix: `echo Comfy CLI version: $(comfy-cli --version) || (apt-get install -y python3-venv && python -m venv .venv && ${activate} && pip install comfy-cli); `,
  });
}
