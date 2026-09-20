// The same fixtures and assertions the Electron build was held to, so a behaviour
// change between the Electron build and this one shows up here rather than on a
// researcher's machine.
use rescicle_lib::agent::{apply_operations, Operation};
use rescicle_lib::db::Db;
use rescicle_lib::domain::{ObjectInput, RelationInput};
use rescicle_lib::files::scan_files;
use serde_json::Value;
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

fn str_of(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or_default().to_string()
}

fn object(type_: &str, title: &str, origin: &str, status: &str) -> ObjectInput {
    ObjectInput {
        type_: type_.into(),
        title: title.into(),
        body: None,
        origin: origin.into(),
        status: status.into(),
    }
}

fn op(op: &str) -> Operation {
    Operation {
        op: op.into(),
        ref_: None,
        object_type: None,
        id: None,
        title: None,
        body: None,
        origin: None,
        status: None,
        subject: None,
        predicate: None,
        object: None,
        path: None,
        performed: None,
    }
}

#[test]
fn smoke() {
    let tmp = TempDir::new("test");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(research.join("nested")).unwrap();
    std::fs::write(research.join("20K.csv"), "temperature,resistance\n20,10\n").unwrap();
    std::fs::write(
        research.join("nested").join("25K.csv"),
        "temperature,resistance\n25,8\n",
    )
    .unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project = db
        .create_project("Low temperature study", research.to_str().unwrap())
        .unwrap();
    let project_id = str_of(&project, "id");

    let renamed = db
        .rename_project(&project_id, "  Low temperature study (2026)  ", "researcher")
        .unwrap();
    assert_eq!(str_of(&renamed, "name"), "Low temperature study (2026)");
    assert_eq!(
        str_of(&db.get_project(&project_id).unwrap().unwrap(), "name"),
        "Low temperature study (2026)"
    );
    assert!(db.rename_project(&project_id, "   ", "researcher").is_err());

    let q = db
        .create_object(
            &project_id,
            &object("question", "How does resistance change?", "researcher", "confirmed"),
            "researcher",
        )
        .unwrap();
    let h = db
        .create_object(
            &project_id,
            &object("hypothesis", "State change near 25 K", "researcher", "proposed"),
            "researcher",
        )
        .unwrap();
    db.create_relation(
        &project_id,
        &RelationInput {
            subject_id: str_of(&h, "id"),
            predicate: "addresses".into(),
            object_id: str_of(&q, "id"),
            origin: "researcher".into(),
            status: "proposed".into(),
        },
        "researcher",
    )
    .unwrap();
    assert_eq!(
        db.list_objects(&project_id, Some("hypothesis")).unwrap().len(),
        1
    );
    let fetched = db.get_object(&str_of(&h, "id")).unwrap().unwrap();
    assert_eq!(fetched["outgoing"][0]["object_id"], q["id"]);

    assert_eq!(scan_files(&research, 300).len(), 2);
    let asset = db
        .register_asset(&project_id, &research.join("20K.csv"))
        .unwrap();
    assert_eq!(str_of(&asset, "type"), "asset");

    // A model names an object it is creating in the same turn; create_relation then
    // has to resolve "p1" to the id the create_object call produced.
    let applied = apply_operations(
        &db,
        &research,
        &project_id,
        &[
            Operation {
                ref_: Some("p1".into()),
                object_type: Some("prediction".into()),
                title: Some("A second sample shows the same change".into()),
                origin: Some("agent".into()),
                status: Some("proposed".into()),
                ..op("create_object")
            },
            Operation {
                origin: Some("agent".into()),
                status: Some("proposed".into()),
                subject: Some(str_of(&h, "id")),
                predicate: Some("predicts".into()),
                object: Some("p1".into()),
                ..op("create_relation")
            },
            Operation {
                ref_: Some("a2".into()),
                path: Some("nested/25K.csv".into()),
                ..op("register_asset")
            },
        ],
    );
    assert_eq!(
        applied.iter().filter(|r| r["ok"] == Value::Bool(true)).count(),
        3,
        "operations reported failures: {applied:?}"
    );
    assert_eq!(db.list_objects(&project_id, Some("prediction")).unwrap().len(), 1);
    assert_eq!(db.list_objects(&project_id, Some("asset")).unwrap().len(), 2);

    // Re-pointing the research folder: the wrong one can be picked at onboarding and
    // there has to be a way back. Assets hold a path relative to the root, so the
    // call reports the ones the new folder does not have.
    let moved = tmp.path().join("moved");
    std::fs::create_dir_all(&moved).unwrap();
    std::fs::write(moved.join("20K.csv"), "temperature,resistance").unwrap();
    let (rerooted, missing) = db
        .set_project_root(&project_id, moved.to_str().unwrap(), "researcher")
        .unwrap();
    // resolve() is lexical, so compare against the same normalisation the database
    // stored rather than canonicalize(), which would hand back a \\?\ path.
    assert_eq!(
        PathBuf::from(str_of(&rerooted, "root_path")),
        rescicle_lib::files::resolve(&moved)
    );
    assert_eq!(
        missing,
        vec![Path::new("nested")
            .join("25K.csv")
            .to_string_lossy()
            .into_owned()]
    );
    assert!(db
        .set_project_root(&project_id, research.to_str().unwrap(), "researcher")
        .unwrap()
        .1
        .is_empty());

    assert!(db
        .set_project_root(&project_id, tmp.path().join("nope").to_str().unwrap(), "researcher")
        .is_err());
    assert!(db
        .set_project_root(&project_id, research.join("20K.csv").to_str().unwrap(), "researcher")
        .is_err());

    assert!(db
        .register_asset(&project_id, &tmp.path().join("outside.txt"))
        .is_err());
}

#[test]
fn resolve_is_lexical_and_contains() {
    use rescicle_lib::files::{is_inside, resolve, resolve_project_file};

    let root = resolve(Path::new("C:/tmp/research"));
    assert_eq!(resolve(Path::new("C:/tmp/research/../research/a.csv")), root.join("a.csv"));
    assert!(is_inside(&root, &root.join("nested").join("a.csv")));
    assert!(!is_inside(&root, &root));
    assert!(!is_inside(&root, Path::new("C:/tmp/other")));
    // The guard that keeps the agent from registering anything outside the folder.
    assert!(resolve_project_file(&root, "../secrets.txt").is_err());
    assert!(resolve_project_file(&root, "nested/a.csv").is_ok());
}

#[test]
fn parses_structured_output_through_a_fence() {
    use rescicle_lib::claude_agent::parse_structured;

    let bare = parse_structured(r#"{"reply":"ok","operations":[]}"#).unwrap();
    assert_eq!(bare.reply, "ok");

    let fenced = parse_structured("```json\n{\"reply\":\"fenced\",\"operations\":[]}\n```").unwrap();
    assert_eq!(fenced.reply, "fenced");

    let chatty =
        parse_structured("Here you go:\n{\"reply\":\"scanned\",\"operations\":[]}\nhope that helps")
            .unwrap();
    assert_eq!(chatty.reply, "scanned");

    assert!(parse_structured("no json at all").is_none());
}

// A relation carries its own status, so the researcher decides on it the same
// way they decide on an object: keeping a hypothesis while rejecting the link
// an agent drew from it has to be sayable.
#[test]
fn a_relation_can_be_decided_and_undecided() {
    let tmp = TempDir::new("rel");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("rel", research.to_str().unwrap()).unwrap(),
        "id",
    );
    let q = db
        .create_object(&project_id, &object("question", "Q", "researcher", "confirmed"), "researcher")
        .unwrap();
    let h = db
        .create_object(&project_id, &object("hypothesis", "H", "agent", "proposed"), "agent")
        .unwrap();
    let relation = db
        .create_relation(
            &project_id,
            &RelationInput {
                subject_id: str_of(&h, "id"),
                predicate: "addresses".into(),
                object_id: str_of(&q, "id"),
                origin: "agent".into(),
                status: "proposed".into(),
            },
            "agent",
        )
        .unwrap();
    let relation_id = str_of(&relation, "id");
    assert_eq!(str_of(&relation, "status"), "proposed");

    for next in ["confirmed", "rejected", "proposed"] {
        let updated = db
            .update_relation_status(&relation_id, next, "researcher")
            .unwrap();
        assert_eq!(str_of(&updated, "status"), next, "could not move to {next}");
    }

    assert!(db
        .update_relation_status(&relation_id, "maybe", "researcher")
        .is_err());
    assert!(db
        .update_relation_status("rel_missing", "confirmed", "researcher")
        .is_err());

    // The decision is recorded the way an object's is.
    let events = db.list_relations(&project_id).unwrap();
    assert_eq!(events.len(), 1, "no duplicate relation was created");
}

// Saying no to a line takes it out instead of leaving it struck through in the
// cards at both of its ends. What makes that safe is that the same link can be
// drawn again, so the researcher is never stuck with an agent's guess or
// without it.
#[test]
fn a_relation_can_be_removed_and_drawn_again() {
    let tmp = TempDir::new("rel-drop");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("rel-drop", research.to_str().unwrap()).unwrap(),
        "id",
    );
    let q = db
        .create_object(&project_id, &object("question", "Q", "researcher", "confirmed"), "researcher")
        .unwrap();
    let h = db
        .create_object(&project_id, &object("hypothesis", "H", "agent", "proposed"), "agent")
        .unwrap();
    let link = || RelationInput {
        subject_id: str_of(&h, "id"),
        predicate: "addresses".into(),
        object_id: str_of(&q, "id"),
        origin: "agent".into(),
        status: "proposed".into(),
    };

    let relation_id = str_of(&db.create_relation(&project_id, &link(), "agent").unwrap(), "id");
    db.delete_relation(&relation_id, "researcher").unwrap();
    assert!(
        db.list_relations(&project_id).unwrap().is_empty(),
        "the line the agent drew is gone, not struck through"
    );
    assert!(
        db.delete_relation(&relation_id, "researcher").is_err(),
        "a line that is already gone cannot be removed twice"
    );

    // Deciding it again is the way back, and it is a new line rather than the
    // old one coming back out of create_relation's duplicate check.
    let again = str_of(
        &db.create_relation(&project_id, &link(), "researcher").unwrap(),
        "id",
    );
    assert_ne!(again, relation_id);
    assert_eq!(db.list_relations(&project_id).unwrap().len(), 1);
}

// Deciding to run a measurement and having run it are different things, and a
// confirmed measurement that has not been done yet is the ordinary case. Both
// have to be sayable at once, which is why this is not a fourth status.
#[test]
fn a_measurement_is_run_or_not_regardless_of_its_status() {
    let tmp = TempDir::new("performed");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();
    std::fs::write(research.join("run.csv"), "a,b
1,2
").unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("performed", research.to_str().unwrap()).unwrap(),
        "id",
    );
    let m = db
        .create_object(&project_id, &object("measurement", "M", "researcher", "confirmed"), "researcher")
        .unwrap();
    let m_id = str_of(&m, "id");
    let fetched = db.get_object(&m_id).unwrap().unwrap();
    assert_eq!(fetched["performed"], Value::Bool(false));
    assert!(fetched["performed_at"].is_null());

    // Saying it was run says nothing about when. The moment the button was
    // pressed is not the measurement's date and is not recorded as if it were.
    let done = db.set_measurement_performed(&m_id, true, None, "researcher").unwrap();
    assert_eq!(done["performed"], Value::Bool(true));
    assert!(done["performed_at"].is_null(), "no date was known, so none was invented");
    // The decision it carried is untouched: the two axes do not share a field.
    assert_eq!(str_of(&done, "status"), "confirmed");

    let undone = db.set_measurement_performed(&m_id, false, None, "researcher").unwrap();
    assert_eq!(undone["performed"], Value::Bool(false), "a mis-click has to be undoable");

    // Only a measurement is something that gets run.
    let q = db
        .create_object(&project_id, &object("question", "Q", "researcher", "confirmed"), "researcher")
        .unwrap();
    assert!(db
        .set_measurement_performed(&str_of(&q, "id"), true, None, "researcher")
        .is_err());

    // Data came out of it, so it was run -- and the file carries the date.
    db.set_measurement_performed(&m_id, true, None, "researcher").unwrap();
    let asset = db.register_asset(&project_id, &research.join("run.csv")).unwrap();
    let file_date = str_of(&db.get_object(&str_of(&asset, "id")).unwrap().unwrap()["asset"], "modified_at");
    db.create_relation(
        &project_id,
        &RelationInput {
            subject_id: m_id.clone(),
            predicate: "produces".into(),
            object_id: str_of(&asset, "id"),
            origin: "researcher".into(),
            status: "confirmed".into(),
        },
        "researcher",
    )
    .unwrap();
    let after = db.get_object(&m_id).unwrap().unwrap();
    assert_eq!(after["performed"], Value::Bool(true));
    assert_eq!(
        str_of(&after, "performed_at"),
        file_date,
        "the date should come from the file the measurement produced"
    );

    // The agent is told to record this and to keep it out of the body, so it has
    // to be able to see it; otherwise it would set what is already set and have
    // nothing to answer "which measurements are left" from.
    let context = db.context(&project_id, None).unwrap();
    let in_context = context["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["id"] == Value::String(m_id.clone()))
        .expect("the measurement reaches the agent");
    assert_eq!(in_context["performed"], Value::Bool(true));
    assert_eq!(str_of(in_context, "performed_at"), file_date);
    // Nothing else has the axis, so nothing else carries the field.
    let question = context["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["type"] == Value::String("question".into()))
        .expect("the question reaches the agent");
    assert!(question.get("performed").is_none());

    // A date already recorded is the one somebody chose, so linking a file does
    // not overwrite it.
    db.set_measurement_performed(&m_id, true, Some("2026-09-10T00:00:00.000Z"), "researcher")
        .unwrap();
    std::fs::write(research.join("run2.csv"), "a,b
3,4
").unwrap();
    let second = db.register_asset(&project_id, &research.join("run2.csv")).unwrap();
    db.create_relation(
        &project_id,
        &RelationInput {
            subject_id: m_id.clone(),
            predicate: "produces".into(),
            object_id: str_of(&second, "id"),
            origin: "researcher".into(),
            status: "confirmed".into(),
        },
        "researcher",
    )
    .unwrap();
    assert_eq!(
        str_of(&db.get_object(&m_id).unwrap().unwrap(), "performed_at"),
        "2026-09-10T00:00:00.000Z"
    );
}

// Nothing under the research folder is opened without the researcher having
// said so, and what travels is an excerpt, not the file.
#[test]
fn only_shared_files_reach_the_prompt() {
    use rescicle_lib::agent::build_prompt;
    use rescicle_lib::files::scan_files;

    let tmp = TempDir::new("share");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();
    std::fs::write(research.join("open.csv"), "temperature,resistance\n20,10.2\n").unwrap();
    std::fs::write(research.join("private.csv"), "subject,dose\nA,12\n").unwrap();
    // Longer than the excerpt, so the cut can be seen.
    std::fs::write(research.join("big.csv"), "x,y\n".repeat(4000)).unwrap();
    std::fs::write(research.join("photo.png"), [0x89, b'P', b'N', b'G', 0, 1, 2, 3]).unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("share", research.to_str().unwrap()).unwrap(),
        "id",
    );
    let files = scan_files(&research, 120);
    let prompt = |db: &Db| {
        build_prompt(db, &project_id, "どう思う", None, &files, &research).unwrap()
    };

    // Nothing shared: every name is listed, no contents anywhere.
    let before = prompt(&db);
    assert!(before.contains("private.csv"), "the index should still list it");
    assert!(!before.contains("subject,dose"), "a file nobody shared was read");
    assert!(!before.contains("temperature,resistance"));
    assert!(!before.contains("SHARED FILE EXCERPTS"));

    db.set_file_shared(&project_id, "open.csv", true, "researcher").unwrap();
    let after = prompt(&db);
    assert!(after.contains("SHARED FILE EXCERPTS"));
    assert!(after.contains("temperature,resistance"), "the shared file was not sent");
    assert!(!after.contains("subject,dose"), "an unshared file came along with it");

    // A long file is cut, and says so.
    db.set_file_shared(&project_id, "big.csv", true, "researcher").unwrap();
    let cut = prompt(&db);
    assert!(cut.contains(r#""truncated":true"#), "a long file was sent whole");
    assert!(cut.len() < 30_000, "the excerpt did not bound the prompt: {}", cut.len());

    // Sharing a binary shares nothing: a few kilobytes of PNG helps no one.
    db.set_file_shared(&project_id, "photo.png", true, "researcher").unwrap();
    let with_binary = prompt(&db);
    assert!(
        !with_binary.contains(r#"{"path":"photo.png""#),
        "a binary file was excerpted into the prompt"
    );

    // Taking it back takes the contents back out.
    db.set_file_shared(&project_id, "open.csv", false, "researcher").unwrap();
    assert!(!prompt(&db).contains("temperature,resistance"));
}
