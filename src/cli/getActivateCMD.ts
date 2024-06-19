import { os } from "zx";

export function getActivateCMD() {
  const platform = os.platform();
  const activate = platform === "win32" ? ".venv\\Scripts\\activate" : "source .venv/bin/activate";
  console.log("Platform: ", platform, activate);
  return activate;
}
