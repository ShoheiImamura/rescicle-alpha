use crate::agent::{apply_operations, build_prompt};
use crate::claude_agent::ClaudeAgent;
use crate::db::Db;
use crate::domain::RelationInput;
use crate::error::{err, Error, Result};
use crate::files::{resolve_project_file, scan_files};
use crate::settings::Settings;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Mutex<Db>,
    pub settings: Mutex<Settings>,
    pub agent: ClaudeAgent,
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>> {
    mutex
        .lock()
        .map_err(|_| Error("rescicleの内部状態が壊れています。再起動してください。".into()))
}

fn project_root(project: &Value) -> PathBuf {
    PathBuf::from(
        project
            .get("root_path")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )
}

impl AppState {
    fn workspace(&self, project_id: &str) -> Result<Value> {
        lock(&self.db)?.workspace(project_id)
    }

    fn save_settings(&self, settings: &Settings) -> Result<()> {
        settings.save(&self.data_dir)
    }
}

#[tauri::command]
pub async fn agent_status(state: State<'_, AppState>) -> Result<Value> {
    Ok(json!({ "backend": "claude", "claude": state.agent.status().await }))
}

#[tauri::command]
pub async fn agent_refresh(state: State<'_, AppState>) -> Result<Value> {
    state.agent.refresh_bin();
    Ok(json!({ "backend": "claude", "claude": state.agent.status().await }))
}

// The saved id can go stale -- the database replaced, the project gone from
// underneath. It used to be dropped and nothing put in its place, which left
// onboarding as the only screen the app could show while the researcher's work
// sat in the database with no way to reach it: there is no project list in the
// UI to pick from. Fall back to the most recently opened project instead;
// list_projects() is ordered by last_opened_at DESC, so the front of it is the
// one they were last in.
fn pick_current(saved: Option<&str>, projects: &[Value]) -> Option<String> {
    let id_of = |p: &Value| p.get("id").and_then(Value::as_str).map(str::to_string);
    match saved {
        Some(id) if projects.iter().any(|p| id_of(p).as_deref() == Some(id)) => Some(id.to_string()),
        _ => projects.first().and_then(id_of),
    }
}

#[tauri::command]
pub async fn app_bootstrap(state: State<'_, AppState>) -> Result<Value> {
    let (projects, current, workspace) = {
        let db = lock(&state.db)?;
        let mut settings = lock(&state.settings)?;
        let projects = db.list_projects()?;
        let current = pick_current(settings.current_project_id.as_deref(), &projects);
        // Written back, so the fallback happens once rather than on every launch.
        if settings.current_project_id != current {
            settings.current_project_id = current.clone();
            state.save_settings(&settings)?;
        }
        let workspace = match &current {
            Some(id) => db.workspace(id)?,
            None => Value::Null,
        };
        (projects, current, workspace)
    };
    Ok(json!({
        "projects": projects,
        "currentProjectId": current,
        "workspace": workspace,
        "agent": json!({ "backend": "claude", "claude": state.agent.status().await }),
    }))
}

#[tauri::command]
pub async fn project_choose_folder(app: AppHandle) -> Result<Option<String>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .pick_folder(move |picked| { let _ = tx.send(picked); });
    let picked = rx
        .await
        .map_err(|_| Error("フォルダ選択が中断されました".into()))?;
    Ok(picked
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn project_create(state: State<'_, AppState>, name: Option<String>, root_path: Option<String>) -> Result<Value> {
    let Some(root_path) = root_path.filter(|p| !p.trim().is_empty()) else {
        return err("研究フォルダを選択してください");
    };
    let fallback = Path::new(&root_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root_path.clone());
    let name = name.filter(|n| !n.trim().is_empty()).unwrap_or(fallback);

    let project = lock(&state.db)?.create_project(&name, &root_path)?;
    let project_id = project["id"].as_str().unwrap_or_default().to_string();
    let mut settings = lock(&state.settings)?;
    settings.current_project_id = Some(project_id.clone());
    state.save_settings(&settings)?;
    drop(settings);
    state.workspace(&project_id)
}

#[tauri::command]
pub fn project_open(state: State<'_, AppState>, project_id: String) -> Result<Value> {
    {
        let db = lock(&state.db)?;
        if db.get_project(&project_id)?.is_none() {
            return err("project not found");
        }
        db.touch_project(&project_id)?;
    }
    let mut settings = lock(&state.settings)?;
    settings.current_project_id = Some(project_id.clone());
    state.save_settings(&settings)?;
    drop(settings);
    state.workspace(&project_id)
}

#[tauri::command]
pub fn project_rename(state: State<'_, AppState>, project_id: String, name: String) -> Result<Value> {
    lock(&state.db)?.rename_project(&project_id, &name, "researcher")?;
    state.workspace(&project_id)
}

#[tauri::command]
pub fn project_set_root(state: State<'_, AppState>, project_id: String, root_path: String) -> Result<Value> {
    let missing = {
        let db = lock(&state.db)?;
        db.set_project_root(&project_id, &root_path, "researcher")?.1
    };
    Ok(json!({ "workspace": state.workspace(&project_id)?, "missing": missing }))
}

#[tauri::command]
pub fn objects_list(state: State<'_, AppState>, project_id: String, r#type: Option<String>) -> Result<Vec<Value>> {
    lock(&state.db)?.list_objects(&project_id, r#type.as_deref())
}

#[tauri::command]
pub fn object_get(state: State<'_, AppState>, object_id: String) -> Result<Value> {
    Ok(lock(&state.db)?.get_object(&object_id)?.unwrap_or(Value::Null))
}

#[tauri::command]
pub fn object_set_status(state: State<'_, AppState>, object_id: String, status: String) -> Result<Value> {
    lock(&state.db)?.update_object_status(&object_id, &status, "researcher")
}

#[tauri::command]
pub fn relation_set_status(
    state: State<'_, AppState>,
    relation_id: String,
    status: String,
) -> Result<Value> {
    let db = lock(&state.db)?;
    let relation = db.update_relation_status(&relation_id, &status, "researcher")?;
    let project_id = relation["project_id"].as_str().unwrap_or_default().to_string();
    drop(db);
    state.workspace(&project_id)
}

#[tauri::command]
pub fn relation_delete(state: State<'_, AppState>, relation_id: String) -> Result<Value> {
    let db = lock(&state.db)?;
    let relation = db.delete_relation(&relation_id, "researcher")?;
    let project_id = relation["project_id"].as_str().unwrap_or_default().to_string();
    drop(db);
    state.workspace(&project_id)
}

// The renderer only offers the four chain edges from domain.rs:allowed_relation(),
// where a pair of types fixes the predicate, so it sends no origin or status: a
// link the researcher drew by hand is theirs and is already decided.
#[tauri::command]
pub fn relation_create(
    state: State<'_, AppState>,
    project_id: String,
    subject_id: String,
    predicate: String,
    object_id: String,
) -> Result<Value> {
    let db = lock(&state.db)?;
    db.create_relation(
        &project_id,
        &RelationInput {
            subject_id,
            predicate,
            object_id,
            origin: "researcher".into(),
            status: "confirmed".into(),
        },
        "researcher",
    )?;
    drop(db);
    state.workspace(&project_id)
}

#[tauri::command]
pub fn messages_list(state: State<'_, AppState>, project_id: String) -> Result<Vec<Value>> {
    lock(&state.db)?.list_messages(&project_id, 40)
}

#[tauri::command]
pub fn files_scan(state: State<'_, AppState>, project_id: String) -> Result<Value> {
    let db = lock(&state.db)?;
    let project = db
        .get_project(&project_id)?
        .ok_or_else(|| Error("project not found".into()))?;
    let shared: std::collections::HashSet<String> =
        db.shared_files(&project_id)?.into_iter().collect();
    let registered: std::collections::HashMap<String, String> = db
        .asset_paths(&project_id)?
        .into_iter()
        .map(|row| {
            (
                row["relative_path"].as_str().unwrap_or_default().to_string(),
                row["object_id"].as_str().unwrap_or_default().to_string(),
            )
        })
        .collect();
    let listed: Vec<Value> = scan_files(&project_root(&project), 300)
        .into_iter()
        .map(|file| {
            let is_shared = shared.contains(&file.relative_path);
            let asset_id = registered.get(&file.relative_path).cloned();
            let mut value = serde_json::to_value(file).unwrap_or(Value::Null);
            if let Some(map) = value.as_object_mut() {
                map.insert("shared".into(), json!(is_shared));
                map.insert("asset_id".into(), json!(asset_id));
            }
            value
        })
        .collect();
    Ok(json!(listed))
}

// Sharing is one file at a time and always something the researcher does; the
// agent has no way to ask for it.
#[tauri::command]
pub fn file_set_shared(
    state: State<'_, AppState>,
    project_id: String,
    relative_path: String,
    shared: bool,
) -> Result<Value> {
    let db = lock(&state.db)?;
    let project = db
        .get_project(&project_id)?
        .ok_or_else(|| Error("project not found".into()))?;
    // Refuse a path that leaves the research folder before recording it.
    resolve_project_file(&project_root(&project), &relative_path)?;
    db.set_file_shared(&project_id, &relative_path, shared, "researcher")?;
    Ok(json!({ "path": relative_path, "shared": shared }))
}

#[tauri::command]
pub fn asset_register(state: State<'_, AppState>, project_id: String, relative_path: String) -> Result<Value> {
    let db = lock(&state.db)?;
    let project = db
        .get_project(&project_id)?
        .ok_or_else(|| Error("project not found".into()))?;
    let absolute = resolve_project_file(&project_root(&project), &relative_path)?;
    db.register_asset(&project_id, &absolute)
}

#[tauri::command]
pub async fn agent_send(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    text: String,
    selected_object_id: Option<String>,
) -> Result<Option<Value>> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }

    // The database lock is taken in two short bursts around the Claude turn rather
    // than held for it: a turn runs for seconds to minutes, and nothing else in the
    // app could touch storage while it did.
    let (prompt, root, mut session) = {
        let db = lock(&state.db)?;
        let project = db
            .get_project(&project_id)?
            .ok_or_else(|| Error("project not found".into()))?;
        let root = project_root(&project);
        db.save_message(&project_id, "user", &text)?;
        let files = scan_files(&root, 120);
        let prompt = build_prompt(
            &db,
            &project_id,
            &text,
            selected_object_id.as_deref(),
            &files,
            &root,
        )?;
        let session = lock(&state.settings)?.session(&project_id);
        (prompt, root, session)
    };

    // The reply is read out of the JSON document as it is written and pushed to
    // the window, so the researcher sees the answer forming instead of a blank
    // panel. The whole reply so far is sent each time rather than a delta: the
    // renderer then just replaces the text, with nothing to reassemble or lose.
    let seen = std::sync::Mutex::new(String::new());
    let window = app.clone();
    let on_text = move |chunk: &str| {
        let Ok(mut buffer) = seen.lock() else { return };
        buffer.push_str(chunk);
        if let Some(reply) = crate::partial::partial_reply(&buffer) {
            let _ = window.emit("agent:reply", reply);
        }
    };

    let structured = state
        .agent
        .structured_turn(&mut session, &prompt, Some(&on_text))
        .await?;

    let db = lock(&state.db)?;
    let applied = apply_operations(&db, &root, &project_id, &structured.operations);
    db.save_message(&project_id, "assistant", &structured.reply)?;
    let workspace = db.workspace(&project_id)?;
    drop(db);

    let mut settings = lock(&state.settings)?;
    settings.set_session(&project_id, session);
    state.save_settings(&settings)?;

    Ok(Some(json!({
        "reply": structured.reply,
        "operations": applied,
        "workspace": workspace,
    })))
}

fn setup_command() -> String {
    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "rescicle".into());
    format!("claude mcp add --transport stdio --scope user rescicle -- \"{exe}\" --mcp-server")
}

#[tauri::command]
pub fn claude_setup_info() -> Result<Value> {
    Ok(json!({
        "command": setup_command(),
        "executable": std::env::current_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
    }))
}

#[tauri::command]
pub fn claude_copy_setup(app: AppHandle) -> Result<String> {
    let command = setup_command();
    app.clipboard().write_text(command.clone())?;
    Ok(command)
}

pub fn init_state(app: &AppHandle) -> Result<AppState> {
    let data_dir = crate::settings::data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let _ = app;
    Ok(AppState {
        db: Mutex::new(Db::open(&crate::settings::db_path(&data_dir))?),
        settings: Mutex::new(Settings::load(&data_dir)),
        agent: ClaudeAgent::new(&crate::settings::agent_workspace(&data_dir))?,
        data_dir,
    })
}

#[cfg(test)]
mod tests {
    use super::pick_current;
    use serde_json::{json, Value};

    fn listed(ids: &[&str]) -> Vec<Value> {
        ids.iter().map(|id| json!({ "id": id })).collect()
    }

    #[test]
    fn keeps_the_saved_project_while_it_is_still_there() {
        let projects = listed(&["proj_b", "proj_a"]);
        assert_eq!(pick_current(Some("proj_a"), &projects).as_deref(), Some("proj_a"));
    }

    // The one that stranded a researcher on the onboarding screen with their
    // work still in the database and no way to open it.
    #[test]
    fn falls_back_to_the_most_recently_opened_one() {
        let projects = listed(&["proj_b", "proj_a"]);
        assert_eq!(pick_current(Some("proj_gone"), &projects).as_deref(), Some("proj_b"));
        assert_eq!(pick_current(None, &projects).as_deref(), Some("proj_b"));
    }

    // Before the first project there is nothing to fall back to, and onboarding
    // is the right screen.
    #[test]
    fn has_nothing_to_open_before_the_first_project() {
        assert_eq!(pick_current(Some("proj_gone"), &[]), None);
        assert_eq!(pick_current(None, &[]), None);
    }
}
