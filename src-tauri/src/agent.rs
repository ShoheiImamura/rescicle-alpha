use crate::db::Db;
use crate::domain::{ObjectInput, RelationInput};
use crate::error::Result;
use crate::files::{resolve_project_file, FileEntry};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;

// Both are embedded byte-for-byte rather than written out in Rust source: the
// schema text goes straight into the system prompt, and the instructions are also
// written to AGENTS.md, where a stray re-indent would show up as a diff on every
// launch. See .gitattributes for why they are exempt from CRLF rewriting.
pub const AGENT_INSTRUCTIONS: &str = include_str!("agent_instructions.md");
pub const RESPONSE_SCHEMA: &str = include_str!("response_schema.json");

pub fn system_prompt() -> String {
    format!(
        "{AGENT_INSTRUCTIONS}\n\n## Output format\n\
         Return exactly one JSON object and nothing else: no prose before or after it, no markdown code fence.\n\
         The object must match this JSON schema:\n\
         {RESPONSE_SCHEMA}\n\
         Every operation object must contain all the keys listed in the schema; use null for the ones that do not apply.\n\
         If no research object should change, return an empty operations array."
    )
}

pub fn ensure_agent_workspace(work_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(work_dir)?;
    let instructions = work_dir.join("AGENTS.md");
    let current = std::fs::read_to_string(&instructions).unwrap_or_default();
    if current != AGENT_INSTRUCTIONS {
        std::fs::write(&instructions, AGENT_INSTRUCTIONS)?;
    }
    Ok(())
}

// Shared by every agent backend so each one sees the same research context and the
// same file boundary: names and metadata only, never raw file contents.
pub fn build_prompt(
    db: &Db,
    project_id: &str,
    text: &str,
    selected_object_id: Option<&str>,
    file_index: &[FileEntry],
) -> Result<String> {
    let context = db.context(project_id, selected_object_id)?;
    let safe_files: Vec<Value> = file_index
        .iter()
        .take(120)
        .map(|f| {
            json!({
                "path": f.relative_path,
                "size_bytes": f.size_bytes,
                "modified_at": f.modified_at,
            })
        })
        .collect();
    Ok([
        "PROJECT CONTEXT (rescicle local record, summarized):".to_string(),
        context.to_string(),
        "FILE INDEX (names/metadata only; raw file contents were not sent):".to_string(),
        json!(safe_files).to_string(),
        "CURRENT USER MESSAGE:".to_string(),
        text.to_string(),
    ]
    .join("\n\n"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct Operation {
    pub op: String,
    #[serde(default, rename = "ref")]
    pub ref_: Option<String>,
    #[serde(default)]
    pub object_type: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub origin: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub predicate: Option<String>,
    #[serde(default)]
    pub object: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Structured {
    pub reply: String,
    #[serde(default)]
    pub operations: Vec<Operation>,
}

fn actor_for(origin: Option<&String>) -> &'static str {
    if origin.map(String::as_str) == Some("researcher") {
        "researcher-via-agent"
    } else {
        "agent"
    }
}

// A model may name an object it created earlier in the same turn, before that object
// has a database id. Those placeholders arrive as `ref` on the creating operation and
// are substituted here.
fn deref(refs: &HashMap<String, String>, value: &Option<String>) -> String {
    let raw = value.clone().unwrap_or_default();
    refs.get(&raw).cloned().unwrap_or(raw)
}

// Every operation is attempted on its own and its outcome recorded, because a model
// that gets one relation wrong should not discard the objects it got right. The
// renderer shows the failures back to the researcher.
pub fn apply_operations(
    db: &Db,
    project_root: &Path,
    project_id: &str,
    operations: &[Operation],
) -> Vec<Value> {
    let mut refs: HashMap<String, String> = HashMap::new();
    let mut applied = Vec::new();

    for op in operations {
        // Each arm yields the record the renderer shows, plus the id to publish under
        // this operation's `ref` when it created something.
        let outcome: Result<(Value, Option<String>)> = match op.op.as_str() {
            "create_object" => db
                .create_object(
                    project_id,
                    &ObjectInput {
                        type_: op.object_type.clone().unwrap_or_default(),
                        title: op.title.clone().unwrap_or_else(|| "Untitled".into()),
                        body: op.body.clone(),
                        origin: op.origin.clone().unwrap_or_else(|| "agent".into()),
                        status: op.status.clone().unwrap_or_else(|| "proposed".into()),
                    },
                    actor_for(op.origin.as_ref()),
                )
                .map(|created| {
                    let id = created["id"].as_str().unwrap_or_default().to_string();
                    (json!({ "ok": true, "op": op.op, "id": id }), Some(id))
                }),
            "register_asset" => match &op.path {
                None => crate::error::err("path required"),
                Some(path) => resolve_project_file(project_root, path)
                    .and_then(|absolute| db.register_asset(project_id, &absolute))
                    .map(|asset| {
                        let id = asset["id"].as_str().unwrap_or_default().to_string();
                        (json!({ "ok": true, "op": op.op, "id": id }), Some(id))
                    }),
            },
            "create_relation" => {
                let subject_id = deref(&refs, &op.subject);
                let object_id = deref(&refs, &op.object);
                db.create_relation(
                    project_id,
                    &RelationInput {
                        subject_id,
                        predicate: op.predicate.clone().unwrap_or_default(),
                        object_id,
                        origin: op.origin.clone().unwrap_or_else(|| "agent".into()),
                        status: op.status.clone().unwrap_or_else(|| "proposed".into()),
                    },
                    actor_for(op.origin.as_ref()),
                )
                .map(|relation| (json!({ "ok": true, "op": op.op, "id": relation["id"] }), None))
            }
            "set_status" => {
                let target = deref(&refs, &op.id);
                db.update_object_status(
                    &target,
                    op.status.clone().unwrap_or_default().as_str(),
                    "researcher-via-agent",
                )
                .map(|updated| {
                    (
                        json!({
                            "ok": true, "op": op.op,
                            "id": updated["id"], "status": updated["status"],
                        }),
                        None,
                    )
                })
            }
            // An unknown op is passed over rather than reported;
            // keeping that means a future op name cannot break an older build.
            _ => continue,
        };

        match outcome {
            Ok((record, created_id)) => {
                if let (Some(key), Some(id)) = (&op.ref_, created_id) {
                    refs.insert(key.clone(), id);
                }
                applied.push(record);
            }
            Err(error) => {
                applied.push(json!({ "ok": false, "op": op.op, "error": error.to_string() }))
            }
        }
    }

    applied
}
