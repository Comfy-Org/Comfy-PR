import DIE from "@snomiao/die";
import { $ as bunSh } from "bun";
import { getActivateCMD } from "./cli/getActivateCMD";

export async function checkComfyActivated() {
  console.log("Checking ComfyUI Activated...");

  if (!(await bunSh`comfy --help`.quiet().catch(() => null))) {
    const activate = getActivateCMD();
    // apt-get install -y python3 python3-venv
    const installPython =
      process.platform === "win32"
        ? "python3 --version || winget install python3 || choco install -y python3"
        : "apt-get install -y python3 python3-venv";

    const setupScript = `${installPython} && python -m venv .venv && ${activate} && pip install comfy-cli && comfy-cli --help`;
    await bunSh`/bin/sh -c ${setupScript}`.catch(console.error);

    DIE(
      `
Could not find comfy-cli.
Please install comfy-cli before run "bunx comfy-pr" here.

$ >>>>>>>>>>>>>>>>>>>>>>>>>>
${installPython}
python -m venv .venv
${activate}
pip install comfy-cli
comfy-cli --help
`.trim(),
    );
  }
}
