// The secondary path, where Claude Code
// reaches rescicle through the local MCP server instead of the other way round.
use rescicle_lib::db::Db;
use rescicle_lib::mcp::call_tool;
use rescicle_lib::settings::Settings;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let path = std::env::temp_dir().join(format!("rescicle-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).expect("create temp dir");
        Self(path)
    }
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn mcp_tools() {
    let tmp = TempDir::new("mcp-test");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();
    std::fs::write(research.join("a.csv"), "x,y\n1,2\n").unwrap();

    let data_dir = tmp.path();
    let db = Db::open(&tmp.path().join("db.sqlite")).unwrap();
    let project = db.create_project("P", research.to_str().unwrap()).unwrap();
    let project_id = project["id"].as_str().unwrap().to_string();

    // The server reads the open project from settings.json on every call, so the
    // test has to put it there the way the app would.
    let mut settings = Settings::default();
    settings.current_project_id = Some(project_id.clone());
    settings.save(data_dir).unwrap();

    let q = call_tool(
        &db,
        data_dir,
        "create_object",
        &json!({ "type": "question", "title": "Q?", "origin": "researcher" }),
    )
    .unwrap();
    let h = call_tool(
        &db,
        data_dir,
        "create_object",
        &json!({ "type": "hypothesis", "title": "H", "origin": "agent" }),
    )
    .unwrap();
    call_tool(
        &db,
        data_dir,
        "create_relation",
        &json!({
            "subjectId": h["id"], "predicate": "addresses",
            "objectId": q["id"], "origin": "agent"
        }),
    )
    .unwrap();

    let context = call_tool(&db, data_dir, "get_research_context", &json!({})).unwrap();
    assert_eq!(context["objects"].as_array().unwrap().len(), 2);

    let files = call_tool(&db, data_dir, "list_project_files", &json!({ "limit": 10 })).unwrap();
    assert_eq!(files.as_array().unwrap().len(), 1);

    // Claude Code can say a measurement was run, the way the conversation can.
    // The two surfaces had drifted: this one could create and confirm but not
    // record what had actually been done.
    let m = call_tool(
        &db,
        data_dir,
        "create_object",
        &json!({ "type": "measurement", "title": "M", "origin": "researcher" }),
    )
    .unwrap();
    let done = call_tool(
        &db,
        data_dir,
        "set_measurement_performed",
        &json!({ "objectId": m["id"], "performed": true }),
    )
    .unwrap();
    assert_eq!(done["performed"], Value::Bool(true));
    // No date is taken from the caller; one only appears when a file carries it.
    assert!(done["performed_at"].is_null());
    // Deciding to run it is a different axis and is left alone.
    assert_eq!(done["status"], Value::String("proposed".into()));

    // Anything the MCP client proposes stays proposed until the researcher decides.
    assert_eq!(h["status"], Value::String("proposed".into()));

    // Deciding needs the researcher's words; without them it is the agent
    // confirming its own proposal in their name.
    assert!(call_tool(
        &db,
        data_dir,
        "set_object_status",
        &json!({ "objectId": h["id"], "status": "confirmed", "statement": "  " }),
    )
    .is_err());
    let confirmed = call_tool(
        &db,
        data_dir,
        "set_object_status",
        &json!({ "objectId": h["id"], "status": "confirmed", "statement": "それで確定して" }),
    )
    .unwrap();
    assert_eq!(confirmed["status"], Value::String("confirmed".into()));
    // And once decided, it is not this path's to undo.
    assert!(call_tool(
        &db,
        data_dir,
        "set_object_status",
        &json!({ "objectId": h["id"], "status": "rejected", "statement": "やっぱり消して" }),
    )
    .is_err());
    let context = call_tool(&db, data_dir, "get_research_context", &json!({})).unwrap();
    let said = context["recentEvents"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["action"] == "object_confirmed")
        .expect("the decision is in the log");
    assert_eq!(said["detail"]["statement"], "それで確定して");
    // Reads are logged, and kept out of what the agent is shown.
    assert!(context["recentEvents"]
        .as_array()
        .unwrap()
        .iter()
        .all(|e| e["action"] != "mcp_read"));
    let export = db.export_project(&project_id).unwrap();
    assert!(export["events"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["action"] == "mcp_read"));

    assert!(call_tool(&db, data_dir, "no_such_tool", &json!({})).is_err());

    // Nothing open means the server says so instead of guessing a project.
    Settings::default().save(data_dir).unwrap();
    assert!(call_tool(&db, data_dir, "get_research_context", &json!({})).is_err());
}
