import DIE from "@snomiao/die";
import { $ as bunSh } from "bun";
import { os } from "zx";

if (import.meta.main) {
  await checkComfyActivated();
}
export async function checkComfyActivated() {
  console.log("Checking ComfyUI Activated...");

  if (!(await bunSh`comfy --help`.quiet().catch(() => null))) {
    const activate = getActivateCMD();
    // apt-get install -y python3 python3-venv
    const installPython =
      os.platform() === "win32"
        ? "python3 --version || winget install python3 || choco install -y python3"
        : "apt-get install -y python3 python3-venv";
    await bunSh`
${installPython}
python -m venv .venv
${activate}
pip install comfy-cli
comfy-cli --help
`.catch(console.error);

    DIE(
      `
Cound not found comfy-cli.
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
function getActivateCMD() {
  const platform = os.platform();
  console.log("Platform: ", platform);
  const activate =
    platform === "win32"
      ? ".venv\\Scripts\\activate"
      : "source .venv/bin/activate";
  return activate;
}
