use crate::domain::{
    allowed_relation, validate_object_input, validate_relation_input, ObjectInput, RelationInput,
};
use crate::error::{err, Error, Result};
use crate::files::{iso, resolve};
use rusqlite::{params, Connection, Row};
use serde_json::{json, Map, Value};
use std::path::Path;

pub struct Db {
    conn: Connection,
}

fn new_id(prefix: &str) -> String {
    let raw = uuid::Uuid::new_v4().simple().to_string();
    format!("{prefix}_{}", &raw[..16])
}

fn now() -> String {
    iso(std::time::SystemTime::now())
}

// Every row reaches the renderer as a flat object whose
// keys are the column names, because src/renderer/app.js reads them directly.
fn row_to_value(row: &Row<'_>) -> rusqlite::Result<Value> {
    let mut map = Map::new();
    for (index, name) in row.as_ref().column_names().iter().enumerate() {
        let value = match row.get_ref(index)? {
            rusqlite::types::ValueRef::Null => Value::Null,
            rusqlite::types::ValueRef::Integer(i) => json!(i),
            rusqlite::types::ValueRef::Real(f) => json!(f),
            rusqlite::types::ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
            rusqlite::types::ValueRef::Blob(_) => Value::Null,
        };
        map.insert((*name).to_string(), value);
    }
    Ok(Value::Object(map))
}

fn query_all(conn: &Connection, sql: &str, args: &[&dyn rusqlite::ToSql]) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(args, row_to_value)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn query_one(conn: &Connection, sql: &str, args: &[&dyn rusqlite::ToSql]) -> Result<Option<Value>> {
    Ok(query_all(conn, sql, args)?.into_iter().next())
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(std::time::Duration::from_millis(5000))?;
        conn.execute_batch(include_str!("schema.sql"))?;
        // schema.sql turns WAL on but leaves synchronous at FULL, which costs an
        // fsync per INSERT. NORMAL under WAL can lose the most recent commits on a
        // power cut but never corrupts the file, and it makes writes ~15x cheaper.
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Ok(Self { conn })
    }

    fn event(
        &self,
        project_id: &str,
        action: &str,
        actor: &str,
        object_id: Option<&str>,
        relation_id: Option<&str>,
        detail: Option<Value>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO events(id,project_id,object_id,relation_id,action,actor,detail_json,created_at)
             VALUES(?,?,?,?,?,?,?,?)",
            params![
                new_id("evt"),
                project_id,
                object_id,
                relation_id,
                action,
                actor,
                detail.map(|d| d.to_string()),
                now()
            ],
        )?;
        Ok(())
    }

    pub fn create_project(&self, name: &str, root_path: &str) -> Result<Value> {
        let id = new_id("proj");
        let root = resolve(Path::new(root_path)).to_string_lossy().into_owned();
        let stamp = now();
        self.conn.execute(
            "INSERT INTO projects(id,name,root_path,created_at,last_opened_at) VALUES(?,?,?,?,?)",
            params![id, name.trim(), root, stamp, stamp],
        )?;
        self.require_project(&id)
    }

    pub fn list_projects(&self) -> Result<Vec<Value>> {
        query_all(
            &self.conn,
            "SELECT * FROM projects ORDER BY last_opened_at DESC",
            &[],
        )
    }

    pub fn get_project(&self, project_id: &str) -> Result<Option<Value>> {
        query_one(
            &self.conn,
            "SELECT * FROM projects WHERE id=?",
            &[&project_id],
        )
    }

    fn require_project(&self, project_id: &str) -> Result<Value> {
        self.get_project(project_id)?
            .ok_or_else(|| Error("project not found".into()))
    }

    pub fn touch_project(&self, project_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE projects SET last_opened_at=? WHERE id=?",
            params![now(), project_id],
        )?;
        Ok(())
    }

    pub fn rename_project(&self, project_id: &str, name: &str, actor: &str) -> Result<Value> {
        let project = self.require_project(project_id)?;
        let next = name.trim();
        if next.is_empty() {
            return err("project name is required");
        }
        let previous = text(&project, "name");
        if next == previous {
            return Ok(project);
        }
        self.conn.execute(
            "UPDATE projects SET name=? WHERE id=?",
            params![next, project_id],
        )?;
        self.event(
            project_id,
            "project_renamed",
            actor,
            None,
            None,
            Some(json!({ "from": previous, "to": next })),
        )?;
        self.require_project(project_id)
    }

    pub fn set_project_root(
        &self,
        project_id: &str,
        root_path: &str,
        actor: &str,
    ) -> Result<(Value, Vec<String>)> {
        let project = self.require_project(project_id)?;
        let raw = root_path.trim();
        if raw.is_empty() {
            return err("research folder is required");
        }
        let next = resolve(Path::new(raw));
        match std::fs::metadata(&next) {
            Err(_) => return err("research folder not found"),
            Ok(meta) if !meta.is_dir() => return err("research folder must be a directory"),
            Ok(_) => {}
        }
        let next_str = next.to_string_lossy().into_owned();
        let previous = text(&project, "root_path");
        if next_str == previous {
            return Ok((project, Vec::new()));
        }
        self.conn.execute(
            "UPDATE projects SET root_path=? WHERE id=?",
            params![next_str, project_id],
        )?;
        self.event(
            project_id,
            "project_root_changed",
            actor,
            None,
            None,
            Some(json!({ "from": previous, "to": next_str })),
        )?;
        // Assets are stored as a path relative to the root, so re-pointing it can
        // leave some of them hanging. Report which rather than listing files that
        // are gone.
        let missing = query_all(
            &self.conn,
            "SELECT a.relative_path FROM assets a JOIN objects o ON o.id=a.object_id
             WHERE o.project_id=? ORDER BY a.relative_path",
            &[&project_id],
        )?
        .into_iter()
        .map(|row| text(&row, "relative_path"))
        .filter(|rel| !next.join(rel).exists())
        .collect();
        Ok((self.require_project(project_id)?, missing))
    }

    pub fn create_object(&self, project_id: &str, input: &ObjectInput, actor: &str) -> Result<Value> {
        validate_object_input(input)?;
        self.require_project(project_id)?;
        let id = new_id(&input.type_[..4.min(input.type_.len())]);
        let stamp = now();
        self.conn.execute(
            "INSERT INTO objects(id,project_id,type,title,body,origin,status,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?)",
            params![
                id,
                project_id,
                input.type_,
                input.title.trim(),
                input.body,
                input.origin,
                input.status,
                stamp,
                stamp
            ],
        )?;
        self.event(
            project_id,
            "object_created",
            actor,
            Some(&id),
            None,
            Some(json!({ "type": input.type_, "status": input.status })),
        )?;
        query_one(&self.conn, "SELECT * FROM objects WHERE id=?", &[&id])?
            .ok_or_else(|| Error("object not found".into()))
    }

    pub fn update_object_status(&self, object_id: &str, status: &str, actor: &str) -> Result<Value> {
        if !["proposed", "confirmed", "rejected"].contains(&status) {
            return err("invalid status");
        }
        let object = query_one(&self.conn, "SELECT * FROM objects WHERE id=?", &[&object_id])?
            .ok_or_else(|| Error("object not found".into()))?;
        self.conn.execute(
            "UPDATE objects SET status=?, updated_at=? WHERE id=?",
            params![status, now(), object_id],
        )?;
        self.event(
            &text(&object, "project_id"),
            &format!("object_{status}"),
            actor,
            Some(object_id),
            None,
            Some(json!({ "from": text(&object, "status"), "to": status })),
        )?;
        self.get_object(object_id)?
            .ok_or_else(|| Error("object not found".into()))
    }

    // A relation carries its own origin and status, so an agent's guess about how
    // two objects connect is a proposal the researcher decides on, exactly like
    // the objects themselves. Keeping a hypothesis but rejecting the link the
    // agent drew from it had no way to be said before this.
    pub fn update_relation_status(
        &self,
        relation_id: &str,
        status: &str,
        actor: &str,
    ) -> Result<Value> {
        if !["proposed", "confirmed", "rejected"].contains(&status) {
            return err("invalid status");
        }
        let relation = query_one(
            &self.conn,
            "SELECT * FROM relations WHERE id=?",
            &[&relation_id],
        )?
        .ok_or_else(|| Error("relation not found".into()))?;
        self.conn.execute(
            "UPDATE relations SET status=? WHERE id=?",
            params![status, relation_id],
        )?;
        self.event(
            &text(&relation, "project_id"),
            &format!("relation_{status}"),
            actor,
            None,
            Some(relation_id),
            Some(json!({ "from": text(&relation, "status"), "to": status })),
        )?;
        query_one(
            &self.conn,
            "SELECT * FROM relations WHERE id=?",
            &[&relation_id],
        )?
        .ok_or_else(|| Error("relation not found".into()))
    }

    pub fn list_objects(&self, project_id: &str, type_: Option<&str>) -> Result<Vec<Value>> {
        match type_ {
            Some(t) => query_all(
                &self.conn,
                "SELECT * FROM objects WHERE project_id=? AND type=? ORDER BY updated_at DESC",
                &[&project_id, &t],
            ),
            None => query_all(
                &self.conn,
                "SELECT * FROM objects WHERE project_id=? ORDER BY updated_at DESC",
                &[&project_id],
            ),
        }
    }

    pub fn get_object(&self, object_id: &str) -> Result<Option<Value>> {
        let Some(mut object) =
            query_one(&self.conn, "SELECT * FROM objects WHERE id=?", &[&object_id])?
        else {
            return Ok(None);
        };
        let outgoing = query_all(
            &self.conn,
            "SELECT r.*, o.type object_type, o.title object_title, o.status object_status
             FROM relations r JOIN objects o ON o.id=r.object_id
             WHERE r.subject_id=? ORDER BY r.created_at",
            &[&object_id],
        )?;
        let incoming = query_all(
            &self.conn,
            "SELECT r.*, o.type subject_type, o.title subject_title, o.status subject_status
             FROM relations r JOIN objects o ON o.id=r.subject_id
             WHERE r.object_id=? ORDER BY r.created_at",
            &[&object_id],
        )?;
        let map = object.as_object_mut().expect("row is an object");
        map.insert("outgoing".into(), json!(outgoing));
        map.insert("incoming".into(), json!(incoming));
        if map.get("type").and_then(Value::as_str) == Some("asset") {
            let asset = query_one(
                &self.conn,
                "SELECT * FROM assets WHERE object_id=?",
                &[&object_id],
            )?;
            map.insert("asset".into(), asset.unwrap_or(Value::Null));
        }
        Ok(Some(object))
    }

    pub fn create_relation(
        &self,
        project_id: &str,
        input: &RelationInput,
        actor: &str,
    ) -> Result<Value> {
        validate_relation_input(input)?;
        let subject = self
            .get_object(&input.subject_id)?
            .ok_or_else(|| Error("relation object not found".into()))?;
        let object = self
            .get_object(&input.object_id)?
            .ok_or_else(|| Error("relation object not found".into()))?;
        if text(&subject, "project_id") != project_id || text(&object, "project_id") != project_id {
            return err("cross-project relation not allowed");
        }
        let (subject_type, object_type) = (text(&subject, "type"), text(&object, "type"));
        if !allowed_relation(&subject_type, &input.predicate, &object_type) {
            return err(format!(
                "relation not allowed: {subject_type} {} {object_type}",
                input.predicate
            ));
        }
        let existing = query_one(
            &self.conn,
            "SELECT * FROM relations WHERE project_id=? AND subject_id=? AND predicate=? AND object_id=? LIMIT 1",
            &[&project_id, &input.subject_id, &input.predicate, &input.object_id],
        )?;
        if let Some(found) = existing {
            return Ok(found);
        }
        let id = new_id("rel");
        self.conn.execute(
            "INSERT INTO relations(id,project_id,subject_id,predicate,object_id,origin,status,created_at)
             VALUES(?,?,?,?,?,?,?,?)",
            params![
                id,
                project_id,
                input.subject_id,
                input.predicate,
                input.object_id,
                input.origin,
                input.status,
                now()
            ],
        )?;
        self.event(
            project_id,
            "relation_created",
            actor,
            None,
            Some(&id),
            Some(json!({ "predicate": input.predicate, "status": input.status })),
        )?;
        query_one(&self.conn, "SELECT * FROM relations WHERE id=?", &[&id])?
            .ok_or_else(|| Error("relation not found".into()))
    }

    pub fn list_relations(&self, project_id: &str) -> Result<Vec<Value>> {
        query_all(
            &self.conn,
            "SELECT * FROM relations WHERE project_id=? ORDER BY created_at",
            &[&project_id],
        )
    }

    pub fn register_asset(&self, project_id: &str, absolute_path: &Path) -> Result<Value> {
        let project = self.require_project(project_id)?;
        let root = resolve(Path::new(&text(&project, "root_path")));
        let abs = resolve(absolute_path);
        let Ok(rel) = abs.strip_prefix(&root) else {
            return err("asset path must be inside project root");
        };
        if rel.as_os_str().is_empty() {
            return err("asset path must be inside project root");
        }
        let rel = rel.to_string_lossy().into_owned();
        let meta = std::fs::metadata(&abs)?;
        if !meta.is_file() {
            return err("asset must be a file");
        }
        let existing = query_one(
            &self.conn,
            "SELECT o.id FROM objects o JOIN assets a ON a.object_id=o.id
             WHERE o.project_id=? AND a.relative_path=? LIMIT 1",
            &[&project_id, &rel.as_str()],
        )?;
        if let Some(found) = existing {
            return self
                .get_object(&text(&found, "id"))?
                .ok_or_else(|| Error("object not found".into()));
        }
        let filename = abs
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| rel.clone());
        let object = self.create_object(
            project_id,
            &ObjectInput {
                type_: "asset".into(),
                title: filename,
                body: None,
                origin: "system".into(),
                status: "confirmed".into(),
            },
            "system",
        )?;
        let object_id = text(&object, "id");
        self.conn.execute(
            "INSERT INTO assets(object_id,relative_path,size_bytes,modified_at,sha256,media_type)
             VALUES(?,?,?,?,?,?)",
            params![
                object_id,
                rel,
                meta.len() as i64,
                meta.modified().map(iso).unwrap_or_default(),
                Option::<String>::None,
                Option::<String>::None
            ],
        )?;
        self.get_object(&object_id)?
            .ok_or_else(|| Error("object not found".into()))
    }

    // Sharing is per file and always the researcher's own act. Without a row
    // here nothing under the research folder is opened, let alone sent, so the
    // promise the app makes is enforced by there being no other path to the
    // bytes rather than by remembering not to take one.
    pub fn set_file_shared(
        &self,
        project_id: &str,
        relative_path: &str,
        shared: bool,
        actor: &str,
    ) -> Result<()> {
        self.require_project(project_id)?;
        if shared {
            self.conn.execute(
                "INSERT OR IGNORE INTO shared_files(project_id,relative_path,shared_at) VALUES(?,?,?)",
                params![project_id, relative_path, now()],
            )?;
        } else {
            self.conn.execute(
                "DELETE FROM shared_files WHERE project_id=? AND relative_path=?",
                params![project_id, relative_path],
            )?;
        }
        self.event(
            project_id,
            if shared { "file_shared" } else { "file_unshared" },
            actor,
            None,
            None,
            Some(json!({ "path": relative_path })),
        )?;
        Ok(())
    }

    pub fn shared_files(&self, project_id: &str) -> Result<Vec<String>> {
        Ok(query_all(
            &self.conn,
            "SELECT relative_path FROM shared_files WHERE project_id=? ORDER BY relative_path",
            &[&project_id],
        )?
        .into_iter()
        .map(|row| text(&row, "relative_path"))
        .collect())
    }

    pub fn save_message(&self, project_id: &str, role: &str, content: &str) -> Result<Value> {
        if !["user", "assistant"].contains(&role) {
            return err("invalid message role");
        }
        let id = new_id("msg");
        self.conn.execute(
            "INSERT INTO messages(id,project_id,role,content,created_at) VALUES(?,?,?,?,?)",
            params![id, project_id, role, content, now()],
        )?;
        query_one(&self.conn, "SELECT * FROM messages WHERE id=?", &[&id])?
            .ok_or_else(|| Error("message not found".into()))
    }

    pub fn list_messages(&self, project_id: &str, limit: i64) -> Result<Vec<Value>> {
        let limit = limit.clamp(1, 200);
        query_all(
            &self.conn,
            "SELECT * FROM (SELECT * FROM messages WHERE project_id=? ORDER BY created_at DESC LIMIT ?)
             x ORDER BY created_at ASC",
            &[&project_id, &limit],
        )
    }

    pub fn workspace(&self, project_id: &str) -> Result<Value> {
        let project = self.require_project(project_id)?;
        let objects = self.list_objects(project_id, None)?;
        let mut counts: Map<String, Value> = Map::new();
        for object in &objects {
            let key = text(object, "type");
            let next = counts.get(&key).and_then(Value::as_u64).unwrap_or(0) + 1;
            counts.insert(key, json!(next));
        }
        Ok(json!({
            "project": project,
            "objects": objects,
            "relations": self.list_relations(project_id)?,
            "counts": counts,
            "messages": self.list_messages(project_id, 40)?,
        }))
    }

    pub fn context(&self, project_id: &str, selected_object_id: Option<&str>) -> Result<Value> {
        let objects: Vec<Value> = self
            .list_objects(project_id, None)?
            .into_iter()
            .take(120)
            .map(|o| {
                json!({
                    "id": o.get("id"), "type": o.get("type"), "title": o.get("title"),
                    "body": o.get("body"), "origin": o.get("origin"), "status": o.get("status"),
                })
            })
            .collect();
        let all_relations = self.list_relations(project_id)?;
        let skip = all_relations.len().saturating_sub(200);
        let relations: Vec<Value> = all_relations
            .into_iter()
            .skip(skip)
            .map(|r| {
                json!({
                    "subject_id": r.get("subject_id"), "predicate": r.get("predicate"),
                    "object_id": r.get("object_id"), "status": r.get("status"),
                })
            })
            .collect();
        let selected = match selected_object_id {
            Some(id) => self.get_object(id)?.unwrap_or(Value::Null),
            None => Value::Null,
        };
        Ok(json!({ "objects": objects, "relations": relations, "selectedObject": selected }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // synchronous is per-connection and not stored in the file, so it can only be
    // checked from inside. It is the one pragma standing between an agent turn that
    // writes twenty objects and twenty fsyncs.
    #[test]
    fn open_sets_wal_and_normal_sync() {
        let dir = std::env::temp_dir().join(format!("rescicle-pragma-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Db::open(&dir.join("t.sqlite")).unwrap();

        let journal: String = db
            .conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        let synchronous: i64 = db
            .conn
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .unwrap();

        assert_eq!(journal, "wal");
        assert_eq!(synchronous, 1, "expected NORMAL(1), got {synchronous}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
