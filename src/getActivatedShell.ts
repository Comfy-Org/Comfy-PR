import { $ } from "bun";
import { getActivateCMD } from "./cli/getActivateCMD";

if (import.meta.main) {
  const activate = getActivateCMD();
  // Use .nothrow() + raw shell string to allow `source` on POSIX
  const p = await $`/bin/sh -c ${`${activate} && comfy-cli --version`}`;
  console.log(p.stdout.toString());
}

export function getActivatedShell() {
  const activate = getActivateCMD();
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
    return $`/bin/sh -c ${`${activate} && ${cmd}`}`;
  };
}
