use crate::error::{err, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// The Electron build kept this in app.getPath('userData'), which on Windows is
// %AppData%\rescicle. The port reads and writes the same folder so an existing
// install keeps its database, its settings and its agent workspace.
//
// Both ways of ending up with a relative path are refused rather than resolved
// against the working directory. Falling back to "." would have the app open a
// different database depending on where it was launched from -- from a shell
// sitting in the repository, from Explorer, from WSL -- and quietly start a
// fresh, empty project instead of failing. A researcher would read that as
// their work having been lost.
pub fn data_dir() -> Result<PathBuf> {
    resolve_data_dir(std::env::var("RESCICLE_DATA_DIR").ok().as_deref())
}

// Split from data_dir() so the rules can be tested without writing to the
// process environment, which every other test would see.
fn resolve_data_dir(override_value: Option<&str>) -> Result<PathBuf> {
    match override_value.map(str::trim).filter(|dir| !dir.is_empty()) {
        Some(dir) => {
            // Rejected rather than resolved. A Git Bash path like /c/Users/... is
            // not absolute to Windows, and resolving it would silently produce
            // C:\c\Users\... instead of saying so.
            if !Path::new(dir).is_absolute() {
                return err(format!(
                    "RESCICLE_DATA_DIR には絶対パスを指定してください（受け取った値: {dir}）"
                ));
            }
            Ok(crate::files::resolve(Path::new(dir)))
        }
        None => match dirs::data_dir() {
            Some(base) => Ok(base.join("rescicle")),
            None => err(
                "データの保存先を特定できませんでした。RESCICLE_DATA_DIR に絶対パスを指定して起動してください。",
            ),
        },
    }
}

pub fn settings_path(data_dir: &Path) -> PathBuf {
    data_dir.join("settings.json")
}

pub fn db_path(data_dir: &Path) -> PathBuf {
    data_dir.join("rescicle.sqlite")
}

pub fn agent_workspace(data_dir: &Path) -> PathBuf {
    data_dir.join("agent-workspace")
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub current_project_id: Option<String>,
    #[serde(default)]
    pub project_claude_sessions: HashMap<String, String>,
}

impl Settings {
    // A missing or corrupt file is not an error: the app starts
    // with an empty state, and losing a session id only costs one fresh Claude turn.
    pub fn load(data_dir: &Path) -> Self {
        std::fs::read_to_string(settings_path(data_dir))
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, data_dir: &Path) -> Result<()> {
        std::fs::create_dir_all(data_dir)?;
        std::fs::write(settings_path(data_dir), serde_json::to_string_pretty(self)?)?;
        Ok(())
    }

    pub fn set_session(&mut self, project_id: &str, session_id: Option<String>) {
        match session_id {
            Some(id) => {
                self.project_claude_sessions.insert(project_id.into(), id);
            }
            None => {
                self.project_claude_sessions.remove(project_id);
            }
        }
    }

    pub fn session(&self, project_id: &str) -> Option<String> {
        self.project_claude_sessions.get(project_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_data_dir;
    use std::path::Path;

    #[test]
    fn falls_back_to_the_platform_folder_when_unset_or_blank() {
        // A variable that exists but is empty must not count as an override.
        for unset in [None, Some(""), Some("   ")] {
            let dir = resolve_data_dir(unset).expect("the platform folder should resolve here");
            assert!(dir.is_absolute(), "{dir:?}");
            assert!(dir.ends_with("rescicle"), "{dir:?}");
        }
    }

    #[test]
    fn takes_an_absolute_override() {
        let dir = resolve_data_dir(Some(r"C:\tmp\scratch")).unwrap();
        assert_eq!(dir, Path::new(r"C:\tmp\scratch"));
        // Surrounding whitespace is a shell accident, not part of the path.
        assert_eq!(resolve_data_dir(Some(r"  C:\tmp\scratch  ")).unwrap(), dir);
    }

    // The whole point of the change: the data directory is never inferred from
    // the working directory, so the app cannot open a different database
    // depending on where it was launched from.
    #[test]
    fn refuses_anything_that_would_depend_on_the_working_directory() {
        for relative in ["scratch", r".\scratch", r"..\rescicle-data"] {
            assert!(resolve_data_dir(Some(relative)).is_err(), "accepted {relative}");
        }
    }

    #[test]
    fn refuses_a_git_bash_style_path() {
        // Windows does not read this as absolute; resolving it would have made
        // C:\c\Users\... under whatever directory the app started in.
        let refused = resolve_data_dir(Some("/c/Users/someone/scratch"));
        assert!(refused.is_err());
        assert!(refused.unwrap_err().to_string().contains("絶対パス"));
    }
}
