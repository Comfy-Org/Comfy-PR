import { execaCommand } from "execa";
import { getActivateCMD } from "./cli/getActivateCMD";

if (import.meta.main) {
  const $ = getActivatedShell();
  const p = await $("comfy-cli --version");
  console.log(p.stdout);
}

export function getActivatedShell() {
  const activate = getActivateCMD();
  return (cmd: string) => execaCommand(`${activate} && ${cmd}`, { shell: true });
}
