use crate::error::{err, Result};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

const IGNORED_DIRS: [&str; 6] = [
    ".git",
    ".rescicle",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
];

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub relative_path: String,
    pub filename: String,
    pub extension: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

// Node's path.resolve() is purely lexical: it never touches the disk and never
// follows a symlink. std::fs::canonicalize does both and hands back a \?\ path on
// Windows, which would not compare equal to anything already stored in the database,
// so the containment checks below are built on this instead.
pub fn resolve(input: &Path) -> PathBuf {
    let absolute = if input.is_absolute() {
        input.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(input)
    };
    let mut parts: Vec<Component> = Vec::new();
    for component in absolute.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if matches!(parts.last(), Some(Component::Normal(_))) {
                    parts.pop();
                }
            }
            other => parts.push(other),
        }
    }
    parts.iter().collect()
}

pub fn is_inside(root: &Path, candidate: &Path) -> bool {
    let root = resolve(root);
    let candidate = resolve(candidate);
    candidate != root && candidate.starts_with(&root)
}

pub fn resolve_project_file(root: &Path, relative_path: &str) -> Result<PathBuf> {
    let absolute = resolve(&root.join(relative_path));
    if !is_inside(root, &absolute) {
        return err("path is outside project root");
    }
    Ok(absolute)
}

pub fn iso(time: SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn scan_files(root: &Path, limit: usize) -> Vec<FileEntry> {
    let base = resolve(root);
    let mut out = Vec::new();
    walk(&base, &base, limit, &mut out);
    out
}

fn walk(base: &Path, dir: &Path, limit: usize, out: &mut Vec<FileEntry>) {
    if out.len() >= limit {
        return;
    }
    // readdir order is not guaranteed by either OS, and the scan stops at `limit`,
    // so sorting is what keeps the truncated list from reshuffling between scans.
    let mut entries: Vec<_> = match std::fs::read_dir(dir) {
        Ok(iter) => iter.filter_map(|e| e.ok()).collect(),
        Err(_) => return,
    };
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        if out.len() >= limit {
            break;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            if name.starts_with('.') || IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }
            walk(base, &path, limit, out);
        } else if file_type.is_file() {
            let Ok(meta) = entry.metadata() else { continue };
            let modified_at = meta.modified().map(iso).unwrap_or_default();
            out.push(FileEntry {
                relative_path: path
                    .strip_prefix(base)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .into_owned(),
                extension: path
                    .extension()
                    .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
                    .unwrap_or_default(),
                filename: name,
                size_bytes: meta.len(),
                modified_at,
            });
        }
    }
}
