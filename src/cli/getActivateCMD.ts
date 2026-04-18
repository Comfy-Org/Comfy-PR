export function getActivateCMD() {
  const platform = process.platform;
  const activate = platform === "win32" ? ".venv\\Scripts\\activate" : ". .venv/bin/activate";
  return activate;
}
