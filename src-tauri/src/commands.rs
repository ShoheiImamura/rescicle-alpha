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

// A project can be made before a research folder is chosen: the conversation is
// what the app is for and it needs no folder, so being asked for one was a toll
// on the way in. Empty means not chosen yet, and it must never be treated as a
// path -- resolve() joins a relative path onto the working directory, so an empty
// root would quietly become wherever rescicle happens to have been launched from.
fn project_root_opt(project: &Value) -> Option<PathBuf> {
    let root = project.get("root_path").and_then(Value::as_str)?;
    (!root.trim().is_empty()).then(|| PathBuf::from(root))
}

/// How many files one round may read, and how many rounds a turn may take. Each
/// round is another call to the CLI, so the researcher is waiting through them.
const READ_PER_ROUND: usize = 4;
const READ_ROUNDS: usize = 2;

fn require_root(project: &Value) -> Result<PathBuf> {
    project_root_opt(project)
        .ok_or_else(|| Error("先に研究フォルダを選んでください（設定 → 研究フォルダ）".into()))
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
    // No folder is allowed now. What the research is about is asked for first,
    // and where its files are is asked for when there is something to do with
    // them; requiring it here made the app introduce itself as a file tool.
    let root_path = root_path.map(|p| p.trim().to_string()).unwrap_or_default();
    let fallback = Path::new(&root_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "研究".into());
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

// The first name is the first line of what the researcher typed, cut at thirty
// characters, which is right at the moment it is chosen -- there is nothing else
// to go on, and waiting for the CLI would put a wait in front of the first
// screen. A week later it is a truncated sentence sitting over a map of twenty
// objects, and what the research turned out to be about is now knowable.
//
// So this is offered where renaming already is, and it only proposes: the name
// lands in the field the researcher is editing, and it is still their press that
// saves it. The agent never renames anything by itself.
#[tauri::command]
pub async fn project_suggest_name(state: State<'_, AppState>, project_id: String) -> Result<String> {
    let prompt = {
        let db = lock(&state.db)?;
        crate::agent::naming_prompt(&db, &project_id)?
    };
    let suggested = state
        .agent
        .one_shot(crate::agent::NAMING_SYSTEM_PROMPT, &prompt)
        .await?;
    // A model asked for one line will still sometimes wrap it in quotes or add a
    // sentence after it. Take the first line and strip the quoting rather than
    // reject the answer: what it named is usable, the packaging is not.
    let first = suggested.lines().find(|l| !l.trim().is_empty()).unwrap_or("");
    let cleaned = first
        .trim()
        .trim_matches(|c| c == '"' || c == '「' || c == '」' || c == '『' || c == '』')
        .trim();
    if cleaned.is_empty() {
        return err("研究名を思いつけませんでした。もう一度試すか、自分で入力してください。");
    }
    Ok(cleaned.chars().take(60).collect())
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

// The researcher says it was done; nobody says when. Stamping the moment the
// button was pressed would put a date on the card that is not the measurement's,
// so none is recorded here at all -- the date comes from the file the
// measurement produced, if there is one.
#[tauri::command]
pub fn measurement_set_performed(
    state: State<'_, AppState>,
    object_id: String,
    performed: bool,
) -> Result<Value> {
    lock(&state.db)?.set_measurement_performed(&object_id, performed, None, "researcher")
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
    // Which files the agent has read, so the list can say so. It is a record of
    // what happened, not a setting: nothing here decides what it may read next.
    let read: std::collections::HashSet<String> = db
        .file_read_log(&project_id)?
        .into_iter()
        .filter_map(|row| {
            let detail = row.get("detail_json")?.as_str()?;
            let parsed: Value = serde_json::from_str(detail).ok()?;
            Some(parsed.get("path")?.as_str()?.to_string())
        })
        .collect();
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
    // No folder yet is not an error here: the screen says so and offers to pick
    // one. Scanning nothing is the honest answer.
    let Some(root) = project_root_opt(&project) else {
        return Ok(json!([]));
    };
    let listed: Vec<Value> = scan_files(&root, 300)
        .into_iter()
        .map(|file| {
            let was_read = read.contains(&file.relative_path);
            let asset_id = registered.get(&file.relative_path).cloned();
            let mut value = serde_json::to_value(file).unwrap_or(Value::Null);
            if let Some(map) = value.as_object_mut() {
                map.insert("read".into(), json!(was_read));
                map.insert("asset_id".into(), json!(asset_id));
            }
            value
        })
        .collect();
    Ok(json!(listed))
}

#[tauri::command]
pub fn asset_register(state: State<'_, AppState>, project_id: String, relative_path: String) -> Result<Value> {
    let db = lock(&state.db)?;
    let project = db
        .get_project(&project_id)?
        .ok_or_else(|| Error("project not found".into()))?;
    let absolute = resolve_project_file(&require_root(&project)?, &relative_path)?;
    db.register_asset(&project_id, &absolute, "researcher")
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
    let (prompt, root, mut session, files) = {
        let db = lock(&state.db)?;
        let project = db
            .get_project(&project_id)?
            .ok_or_else(|| Error("project not found".into()))?;
        // Without a folder there is nothing to index and nothing to share, and a
        // turn runs perfectly well on the conversation alone -- which is the whole
        // reason the folder could be left until later.
        let root = project_root_opt(&project).unwrap_or_default();
        db.save_message(&project_id, "user", &text)?;
        let files = if root.as_os_str().is_empty() { Vec::new() } else { scan_files(&root, 120) };
        let prompt = build_prompt(
            &db,
            &project_id,
            &text,
            selected_object_id.as_deref(),
            &files,
            &[],
        )?;
        let session = lock(&state.settings)?.session(&project_id);
        (prompt, root, session, files)
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

    let mut structured = state
        .agent
        .structured_turn(&mut session, &prompt, Some(&on_text))
        .await?;

    // The agent decides what it needs to read, and rescicle does the reading --
    // inside the research folder and nowhere else. Answering then takes another
    // turn, so this is bounded twice over: a few files each round, a couple of
    // rounds, and the researcher waits for one reply either way.
    let mut was_read: Vec<String> = Vec::new();
    for _ in 0..READ_ROUNDS {
        let wanted = structured.read_files.clone().unwrap_or_default();
        // Asking again for something already handed over would loop forever.
        let wanted: Vec<String> = wanted
            .into_iter()
            .filter(|p| !was_read.contains(p))
            .collect();
        if wanted.is_empty() || root.as_os_str().is_empty() {
            break;
        }
        let read = crate::agent::read_requested(&root, &wanted, READ_PER_ROUND);
        if read.is_empty() {
            break;
        }
        was_read.extend(read.iter().map(|f| f.path.clone()));
        let prompt = {
            let db = lock(&state.db)?;
            build_prompt(
                &db,
                &project_id,
                &text,
                selected_object_id.as_deref(),
                &files,
                &read,
            )?
        };
        structured = state
            .agent
            .structured_turn(&mut session, &prompt, Some(&on_text))
            .await?;
    }

    let db = lock(&state.db)?;
    // What left the folder is worth being able to look up afterwards. It is the
    // whole of what replaced asking permission for each file up front.
    for path in &was_read {
        db.log_file_read(&project_id, path, "agent")?;
    }
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

// The binary Claude Code has to launch to reach the MCP server is this one: the
// same executable, started again with --mcp-server.
fn rescicle_exe() -> String {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "rescicle".into())
}

fn setup_command() -> String {
    let exe = rescicle_exe();
    format!("claude mcp add --transport stdio --scope user rescicle -- \"{exe}\" --mcp-server")
}

// Everything rescicle has recorded, gone, leaving the app as it is on a first
// run. The claude session ids go with it: they are keyed by project, and a
// session belonging to a project that no longer exists would only be handed to
// a turn that has nothing to do with it.
#[tauri::command]
pub fn record_clear(state: State<'_, AppState>) -> Result<Value> {
    let removed = {
        let db = lock(&state.db)?;
        db.clear_record()?
    };
    let mut settings = lock(&state.settings)?;
    settings.current_project_id = None;
    settings.project_claude_sessions.clear();
    state.save_settings(&settings)?;
    Ok(json!({ "removed": removed }))
}

#[tauri::command]
pub async fn claude_mcp_status(state: State<'_, AppState>) -> Result<Value> {
    Ok(state.agent.mcp_status(&rescicle_exe()).await)
}

// rescicle already runs the claude CLI to answer a turn, so it can run the one
// command that registers it too. Reading the registration back afterwards is
// what makes the press visible: the screen then says what Claude Code has,
// rather than what it was asked for.
#[tauri::command]
pub async fn claude_mcp_register(state: State<'_, AppState>) -> Result<Value> {
    let exe = rescicle_exe();
    state.agent.mcp_register(&exe).await?;
    Ok(state.agent.mcp_status(&exe).await)
}

// Kept for the researcher who would rather run it themselves, or who needs the
// command on a machine where rescicle cannot reach the CLI.
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
