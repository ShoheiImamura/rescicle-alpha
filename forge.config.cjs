const fs = require('node:fs');
const path = require('node:path');

const CODEX_PACKAGES = [
  'codex-linux-x64',
  'codex-linux-arm64',
  'codex-darwin-x64',
  'codex-darwin-arm64',
  'codex-win32-x64',
  'codex-win32-arm64'
];
const SKIP_SUFFIX = '.rescicle-packaging-skip';

function keepCodexPackage(platform, arch) {
  return {
    'win32-x64': 'codex-win32-x64',
    'win32-arm64': 'codex-win32-arm64',
    'linux-x64': 'codex-linux-x64',
    'linux-arm64': 'codex-linux-arm64',
    'darwin-x64': 'codex-darwin-x64',
    'darwin-arm64': 'codex-darwin-arm64'
  }[`${platform}-${arch}`] || null;
}

function unusedCodexPackageNames(platform, arch) {
  const keep = keepCodexPackage(platform, arch);
  return CODEX_PACKAGES.filter((name) => name !== keep);
}

function openaiDir() {
  return path.join(__dirname, 'node_modules', '@openai');
}

let hiddenDirs = [];

function restoreStraySkipDirs() {
  const root = openaiDir();
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith(SKIP_SUFFIX)) continue;
    const from = path.join(root, name);
    const to = from.slice(0, -SKIP_SUFFIX.length);
    if (!fs.existsSync(to)) fs.renameSync(from, to);
    else fs.rmSync(from, { recursive: true, force: true });
  }
}

function restoreUnusedCodex() {
  restoreStraySkipDirs();
  for (const { from, to } of hiddenDirs) {
    if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
  }
  hiddenDirs = [];
}

async function hideUnusedCodex(_config, platform, arch) {
  restoreUnusedCodex();
  const root = openaiDir();
  if (!fs.existsSync(root)) return;
  for (const name of unusedCodexPackageNames(platform, arch)) {
    const from = path.join(root, name);
    if (!fs.existsSync(from)) continue;
    const to = `${from}${SKIP_SUFFIX}`;
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    fs.renameSync(from, to);
    hiddenDirs.push({ from: to, to: from });
  }
}

async function stripUnusedCodexFromPackage(_config, buildPath, _electronVersion, platform, arch) {
  const root = path.join(buildPath, 'node_modules', '@openai');
  if (!fs.existsSync(root)) return;
  for (const name of unusedCodexPackageNames(platform, arch)) {
    const dir = path.join(root, name);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

process.on('exit', () => {
  try { restoreUnusedCodex(); } catch { /* best-effort restore after a failed package */ }
});

module.exports = {
  packagerConfig: {
    // Native Codex binary must remain a real filesystem path for spawn() on Windows.
    asar: false,
    executableName: 'rescicle'
  },
  hooks: {
    prePackage: hideUnusedCodex,
    packageAfterCopy: stripUnusedCodexFromPackage,
    postPackage: restoreUnusedCodex,
    postMake: restoreUnusedCodex
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'rescicle',
        authors: 'rescicle project',
        description: 'Local-first research copilot'
      }
    }
  ]
};
