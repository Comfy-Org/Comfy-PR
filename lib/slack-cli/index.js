// Auto-loader for slack-cli napi addon
const path = require('path');
const os = require('os');

const TARGETS = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
};

const key = `${os.platform()}-${os.arch()}`;
const target = TARGETS[key];

function tryLoad(name) {
  try { return require(path.join(__dirname, name)); } catch { return null; }
}

// Try target-specific name first, then generic fallback
const mod = (target && tryLoad(`slack-cli.${target}.node`)) || tryLoad('slack-cli.node');
if (!mod) throw new Error(`No slack-cli binary found for ${key}`);
module.exports = mod;
