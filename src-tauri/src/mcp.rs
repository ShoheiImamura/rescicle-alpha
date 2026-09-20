use crate::db::Db;
use crate::domain::{ObjectInput, RelationInput};
use crate::error::{err, Error, Result};
use crate::files::{resolve_project_file, scan_files};
use crate::settings::{self, Settings};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::Path;

fn tools() -> Value {
    json!([
        {
            "name": "get_research_context",
            "description": "Get the current rescicle project context: research objects, relations, and selected project.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "create_object",
            "description": "Create a proposed research object in the current rescicle project.",
            "inputSchema": { "type": "object", "properties": {
                "type": { "type": "string", "enum": ["question","hypothesis","prediction","measurement","note"] },
                "title": { "type": "string" },
                "body": { "type": ["string","null"] },
                "origin": { "type": "string", "enum": ["researcher","agent"] }
            }, "required": ["type","title","origin"], "additionalProperties": false }
        },
        {
            "name": "create_relation",
            "description": "Create a proposed relation between existing rescicle objects.",
            "inputSchema": { "type": "object", "properties": {
                "subjectId": { "type": "string" },
                "predicate": { "type": "string", "enum": ["addresses","predicts","tested_by","produces","references","related_to"] },
                "objectId": { "type": "string" },
                "origin": { "type": "string", "enum": ["researcher","agent"] }
            }, "required": ["subjectId","predicate","objectId","origin"], "additionalProperties": false }
        },
        {
            "name": "set_object_status",
            "description": "Confirm or reject a rescicle research object when the researcher explicitly decides.",
            "inputSchema": { "type": "object", "properties": {
                "objectId": { "type": "string" },
                "status": { "type": "string", "enum": ["proposed","confirmed","rejected"] }
            }, "required": ["objectId","status"], "additionalProperties": false }
        },
        {
            "name": "list_project_files",
            "description": "List file names and metadata inside the current research folder. Does not return file contents.",
            "inputSchema": { "type": "object", "properties": {
                "limit": { "type": "integer", "minimum": 1, "maximum": 300 }
            }, "additionalProperties": false }
        },
        {
            "name": "register_asset",
            "description": "Register an existing file inside the current research folder as an Asset object.",
            "inputSchema": { "type": "object", "properties": {
                "relativePath": { "type": "string" }
            }, "required": ["relativePath"], "additionalProperties": false }
        }
    ])
}

fn arg_str(args: &Value, key: &str) -> String {
    args.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

pub fn call_tool(db: &Db, data_dir: &Path, name: &str, args: &Value) -> Result<Value> {
    // The previous implementation captured the current project once, when Claude
    // Code spawned the server, so switching projects in the app left this process
    // on the old one for its whole life. settings.json is rewritten on every
    // switch, so reading it per call is what makes the secondary path follow.
    let settings = Settings::load(data_dir);
    let Some(project_id) = settings.current_project_id else {
        return err("No rescicle project is currently open. Open a project in the rescicle app first.");
    };
    let project = db
        .get_project(&project_id)?
        .ok_or_else(|| Error("Current project not found".into()))?;
    let root = project
        .get("root_path")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let root = Path::new(&root);

    match name {
        "get_research_context" => db.context(&project_id, None),
        "create_object" => db.create_object(
            &project_id,
            &ObjectInput {
                type_: arg_str(args, "type"),
                title: arg_str(args, "title"),
                body: args
                    .get("body")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                origin: arg_str(args, "origin"),
                status: "proposed".into(),
            },
            if arg_str(args, "origin") == "researcher" {
                "researcher-via-mcp"
            } else {
                "agent-via-mcp"
            },
        ),
        "create_relation" => db.create_relation(
            &project_id,
            &RelationInput {
                subject_id: arg_str(args, "subjectId"),
                predicate: arg_str(args, "predicate"),
                object_id: arg_str(args, "objectId"),
                origin: arg_str(args, "origin"),
                status: "proposed".into(),
            },
            if arg_str(args, "origin") == "researcher" {
                "researcher-via-mcp"
            } else {
                "agent-via-mcp"
            },
        ),
        "set_object_status" => db.update_object_status(
            &arg_str(args, "objectId"),
            &arg_str(args, "status"),
            "researcher-via-mcp",
        ),
        "list_project_files" => {
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(120);
            Ok(json!(scan_files(root, limit.min(300) as usize)))
        }
        "register_asset" => {
            let absolute = resolve_project_file(root, &arg_str(args, "relativePath"))?;
            db.register_asset(&project_id, &absolute)
        }
        other => err(format!("Unknown tool: {other}")),
    }
}

fn text_result(value: &Value) -> Value {
    let text = match value.as_str() {
        Some(s) => s.to_string(),
        None => serde_json::to_string_pretty(value).unwrap_or_default(),
    };
    json!({ "content": [{ "type": "text", "text": text }] })
}

pub fn run_stdio() -> Result<()> {
    let data_dir = settings::data_dir();
    let db = Db::open(&settings::db_path(&data_dir))?;
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        // A notification has no id and expects no reply.
        let Some(id) = message.get("id") else { continue };
        let method = message.get("method").and_then(Value::as_str).unwrap_or("");
        let params = message.get("params").cloned().unwrap_or(Value::Null);

        let response = match method {
            "initialize" => json!({
                "jsonrpc": "2.0", "id": id,
                "result": {
                    "protocolVersion": params.get("protocolVersion")
                        .and_then(Value::as_str).unwrap_or("2025-11-25"),
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "rescicle", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": "Use rescicle tools to read and propose changes to the current research project. Keep agent-generated scientific objects proposed unless the researcher explicitly confirms them."
                }
            }),
            "tools/list" => json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools() } }),
            "tools/call" => {
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let args = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                match call_tool(&db, &data_dir, name, &args) {
                    Ok(value) => json!({ "jsonrpc": "2.0", "id": id, "result": text_result(&value) }),
                    Err(error) => json!({
                        "jsonrpc": "2.0", "id": id,
                        "result": {
                            "content": [{ "type": "text", "text": error.to_string() }],
                            "isError": true
                        }
                    }),
                }
            }
            other => json!({
                "jsonrpc": "2.0", "id": id,
                "error": { "code": -32601, "message": format!("Method not found: {other}") }
            }),
        };

        writeln!(stdout, "{response}")?;
        stdout.flush()?;
    }
    Ok(())
}
