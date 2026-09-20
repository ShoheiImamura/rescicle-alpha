use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// The Electron build kept this in app.getPath('userData'), which on Windows is
// %AppData%\rescicle. The port reads and writes the same folder so an existing
// install keeps its database, its settings and its agent workspace.
pub fn data_dir() -> PathBuf {
    if let Ok(override_dir) = std::env::var("RESCICLE_DATA_DIR") {
        return crate::files::resolve(Path::new(&override_dir));
    }
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("rescicle")
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
