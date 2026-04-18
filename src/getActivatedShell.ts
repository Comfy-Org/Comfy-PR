import { $ } from "bun";
import { getActivateCMD } from "./cli/getActivateCMD";

if (import.meta.main) {
  const activate = getActivateCMD();
  const p = await $`${activate} && comfy-cli --version`;
  console.log(p.stdout.toString());
}

export function getActivatedShell() {
  const activate = getActivateCMD();
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
    return $`${activate} && ${cmd}`;
  };
}
