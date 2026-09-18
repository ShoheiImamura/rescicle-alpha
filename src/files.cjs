const fs = require('node:fs');
const path = require('node:path');

const IGNORED_DIRS = new Set(['.git', '.rescicle', 'node_modules', '.venv', 'venv', '__pycache__']);

function isInside(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function scanFiles(root, limit = 300) {
  const base = path.resolve(root);
  const out = [];
  const walk = (dir) => {
    if (out.length >= limit) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (out.length >= limit) break;
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(abs);
      } else if (entry.isFile()) {
        let stat;
        try { stat = fs.statSync(abs); } catch { continue; }
        out.push({
          relative_path: path.relative(base, abs),
          filename: entry.name,
          extension: path.extname(entry.name).toLowerCase(),
          size_bytes: stat.size,
          modified_at: stat.mtime.toISOString()
        });
      }
    }
  };
  walk(base);
  return out;
}

function resolveProjectFile(root, relativePath) {
  const abs = path.resolve(root, relativePath);
  if (!isInside(root, abs)) throw new Error('path is outside project root');
  return abs;
}

module.exports = { scanFiles, resolveProjectFile, isInside };
