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
        // A prediction is refused without one, and every other type is refused
        // with one, so the helper gives each what it is allowed to have.
        criterion: (type_ == "prediction").then(|| "p_a > p_b".to_string()),
        criterion_note: None,
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
        note: None,
        criterion: None,
        criterion_note: None,
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
        .register_asset(&project_id, &research.join("20K.csv"), "researcher")
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
                // Without this the operation is refused, which is the point of
                // the rule: a prediction that cannot say what would decide it is
                // not one.
                criterion: Some("effect(sample 2) has the same sign as effect(sample 1)".into()),
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
        .register_asset(&project_id, &tmp.path().join("outside.txt"), "researcher")
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
    let asset = db.register_asset(&project_id, &research.join("run.csv"), "researcher").unwrap();
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
    let second = db.register_asset(&project_id, &research.join("run2.csv"), "researcher").unwrap();
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

// Nothing under the research folder is opened until the agent says it needs a
// particular file, and what travels back is an excerpt, not the file. The path
// is resolved against the root, so a name that climbs out of the folder reaches
// nothing at all.
#[test]
fn only_the_files_the_agent_asks_for_reach_the_prompt() {
    use rescicle_lib::agent::{build_prompt, read_requested};
    use rescicle_lib::files::scan_files;

    let tmp = TempDir::new("read");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();
    std::fs::write(research.join("open.csv"), "temperature,resistance
20,10.2
").unwrap();
    std::fs::write(research.join("private.csv"), "subject,dose
A,12
").unwrap();
    // Longer than the excerpt, so the cut can be seen.
    std::fs::write(research.join("big.csv"), "x,y
".repeat(4000)).unwrap();
    std::fs::write(research.join("photo.png"), [0x89, b'P', b'N', b'G', 0, 1, 2, 3]).unwrap();
    std::fs::write(tmp.path().join("outside.txt"), "not yours").unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("read", research.to_str().unwrap()).unwrap(),
        "id",
    );
    let files = scan_files(&research, 120);
    let prompt = |read: &[rescicle_lib::agent::ReadFile]| {
        build_prompt(&db, &project_id, "どう思う", None, &files, read).unwrap()
    };

    // A turn that asked for nothing carries every name and no contents.
    let before = prompt(&[]);
    assert!(before.contains("private.csv"), "the index should still list it");
    assert!(!before.contains("subject,dose"), "a file nobody asked for was read");
    assert!(!before.contains("temperature,resistance"));

    let asked = read_requested(&research, &["open.csv".to_string()], 4);
    let after = prompt(&asked);
    assert!(after.contains("temperature,resistance"), "the file it asked for did not arrive");
    assert!(!after.contains("subject,dose"), "a file it did not ask for came along");

    // A long file is cut, and says so.
    let cut = prompt(&read_requested(&research, &["big.csv".to_string()], 4));
    assert!(cut.contains(r#""truncated":true"#), "a long file was sent whole");
    assert!(cut.len() < 30_000, "the excerpt did not bound the prompt: {}", cut.len());

    // A binary yields nothing: a few kilobytes of PNG helps no one.
    assert!(
        read_requested(&research, &["photo.png".to_string()], 4).is_empty(),
        "a binary file was excerpted into the prompt"
    );

    // And the folder is the whole of what it can reach.
    assert!(
        read_requested(&research, &["../outside.txt".to_string()], 4).is_empty(),
        "a path climbing out of the research folder was read"
    );

    // How many it may have in one round is capped.
    let many: Vec<String> = ["open.csv", "private.csv", "big.csv"].iter().map(|s| s.to_string()).collect();
    assert_eq!(read_requested(&research, &many, 2).len(), 2);
}

// Rejecting is throwing away, so the object leaves the database rather than
// being filed at the bottom of a list forever. It does not leave on the press:
// the researcher has a few minutes to notice a misplaced one, and everything
// hanging off it has to go with it when it does leave.
#[test]
fn a_rejected_object_is_kept_briefly_and_then_deleted() {
    let tmp = TempDir::new("reject-purge");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("reject-purge", research.to_str().unwrap()).unwrap(),
        "id",
    );
    let q = db
        .create_object(&project_id, &object("question", "Q", "researcher", "confirmed"), "researcher")
        .unwrap();
    let h = db
        .create_object(&project_id, &object("hypothesis", "H", "agent", "proposed"), "agent")
        .unwrap();
    let hypothesis_id = str_of(&h, "id");
    db.create_relation(
        &project_id,
        &RelationInput {
            subject_id: hypothesis_id.clone(),
            predicate: "addresses".into(),
            object_id: str_of(&q, "id"),
            origin: "agent".into(),
            status: "proposed".into(),
        },
        "agent",
    )
    .unwrap();

    db.update_object_status(&hypothesis_id, "rejected", "researcher").unwrap();
    assert_eq!(
        db.purge_rejected(&project_id).unwrap(),
        0,
        "a decision made a moment ago can still be taken back"
    );
    assert!(db.get_object(&hypothesis_id).unwrap().is_some());

    // Once the window has passed. A cutoff in the future stands in for waiting.
    let removed = db
        .purge_rejected_before(&project_id, "9999-01-01T00:00:00.000Z")
        .unwrap();
    assert_eq!(removed, 1);
    assert!(
        db.get_object(&hypothesis_id).unwrap().is_none(),
        "the rejected object is gone, not struck through"
    );
    assert!(
        db.list_relations(&project_id).unwrap().is_empty(),
        "the line into it goes with it"
    );
    assert!(
        db.get_object(&str_of(&q, "id")).unwrap().is_some(),
        "and nothing else does"
    );
}

// Resetting is for starting the next session from nothing: everything rescicle
// recorded goes, and the research folder it was recording about does not.
#[test]
fn clearing_the_record_empties_it_and_leaves_the_folder_alone() {
    let tmp = TempDir::new("reset");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();
    let data = research.join("run.csv");
    std::fs::write(&data, "a,b\n1,2\n").unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("reset", research.to_str().unwrap()).unwrap(),
        "id",
    );
    let q = db
        .create_object(&project_id, &object("question", "Q", "researcher", "confirmed"), "researcher")
        .unwrap();
    let h = db
        .create_object(&project_id, &object("hypothesis", "H", "agent", "proposed"), "agent")
        .unwrap();
    db.create_relation(
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
    db.register_asset(&project_id, &data, "researcher").unwrap();

    assert_eq!(db.clear_record().unwrap(), 1);
    assert!(db.list_projects().unwrap().is_empty());
    assert!(
        db.get_object(&str_of(&q, "id")).unwrap().is_none(),
        "objects go with the project they belonged to"
    );
    assert!(
        data.exists(),
        "the researcher's own file is not rescicle's to delete"
    );
}

// The research folder is asked for when there is a file to do something with,
// not on the way in, so a project starts without one. Empty has to stay empty:
// resolve() turns a relative path into one under the working directory, so a
// root of "" would be written down as wherever rescicle was launched from and
// the file list would show the app's own directory.
#[test]
fn a_project_can_start_before_a_research_folder_is_chosen() {
    let tmp = TempDir::new("no-folder");
    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();

    let project = db.create_project("T2を律速しているもの", "").unwrap();
    assert_eq!(str_of(&project, "root_path"), "");

    let project_id = str_of(&project, "id");
    db.create_object(
        &project_id,
        &object("question", "何がT2を決めているか", "researcher", "confirmed"),
        "researcher",
    )
    .unwrap();
    let workspace = db.workspace(&project_id).unwrap();
    assert_eq!(
        workspace["counts"]["question"], 1,
        "the conversation does not go through the folder"
    );

    // And it can be chosen later.
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();
    let (updated, missing) = db
        .set_project_root(&project_id, research.to_str().unwrap(), "researcher")
        .unwrap();
    assert!(!str_of(&updated, "root_path").is_empty());
    assert!(missing.is_empty());
}

// Everything rescicle does to the research folder is looking. It is the promise
// the README leads with and the reason a researcher points it at real data, and
// it is the sort of thing a later change breaks without anyone noticing -- so it
// is checked rather than remembered. Take the folder byte for byte, run
// everything that touches it, and compare.
fn snapshot(root: &Path) -> Vec<(String, Vec<u8>, std::time::SystemTime)> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<(String, Vec<u8>, std::time::SystemTime)>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(base, &path, out);
                continue;
            }
            let rel = path.strip_prefix(base).unwrap().to_string_lossy().into_owned();
            let meta = std::fs::metadata(&path).unwrap();
            out.push((rel, std::fs::read(&path).unwrap(), meta.modified().unwrap()));
        }
    }
    let mut out = Vec::new();
    walk(root, root, &mut out);
    out.sort();
    out
}

#[test]
fn nothing_rescicle_does_writes_to_the_research_folder() {
    use rescicle_lib::agent::{build_prompt, read_requested};
    use rescicle_lib::files::scan_files;

    let tmp = TempDir::new("read-only");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(research.join("data")).unwrap();
    std::fs::write(research.join("data").join("run.csv"), "a,b\n1,2\n").unwrap();
    std::fs::write(research.join("notes.md"), "# メモ\n").unwrap();
    let before = snapshot(&research);

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("read-only", research.to_str().unwrap()).unwrap(),
        "id",
    );

    // Everything with a path in its hands.
    let files = scan_files(&research, 120);
    assert_eq!(files.len(), 2, "the scan should have found both files");
    db.register_asset(&project_id, &research.join("data").join("run.csv"), "researcher")
        .unwrap();
    let read = read_requested(
        &research,
        &["data/run.csv".to_string(), "notes.md".to_string()],
        4,
    );
    assert_eq!(read.len(), 2, "both files should have been readable");
    build_prompt(&db, &project_id, "どう思う", None, &files, &read).unwrap();
    db.workspace(&project_id).unwrap();
    db.set_project_root(&project_id, research.to_str().unwrap(), "researcher")
        .unwrap();
    db.clear_record().unwrap();

    assert_eq!(
        before,
        snapshot(&research),
        "the research folder is not rescicle's to change"
    );
}

// A remark used to be a `note` object joined on by a relation, which said it
// exists on its own and can be about several things at once. It is neither, so
// it became a column -- and the remarks already written have to arrive there.
// One attached to two objects is written onto both, because it was about both
// and copying text loses nothing once nobody points at it. One attached to
// nothing is dropped: with no object to belong to it is a remark on nothing.
#[test]
fn notes_become_a_remark_on_the_object_they_were_about() {
    let tmp = TempDir::new("note-migration");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();
    let path = tmp.path().join("rescicle.sqlite");

    let project_id;
    {
        let db = Db::open(&path).unwrap();
        project_id = str_of(
            &db.create_project("notes", research.to_str().unwrap()).unwrap(),
            "id",
        );
        let q = str_of(
            &db.create_object(&project_id, &object("question", "Q", "researcher", "confirmed"), "researcher").unwrap(),
            "id",
        );
        let h = str_of(
            &db.create_object(&project_id, &object("hypothesis", "H", "agent", "proposed"), "agent").unwrap(),
            "id",
        );

        // The old shape, which create_object will not make any more.
        let conn = rusqlite::Connection::open(&path).unwrap();
        let add_note = |id: &str, title: &str, body: &str| {
            conn.execute(
                "INSERT INTO objects(id,project_id,type,title,body,origin,status,created_at,updated_at)
                 VALUES(?,?,'note',?,?,'agent','proposed','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
                rusqlite::params![id, project_id, title, body],
            )
            .unwrap();
        };
        add_note("note_both", "両方について", "本文A");
        add_note("note_one", "仮説について", "本文B");
        add_note("note_orphan", "どこにも属さない", "本文C");
        for (subject, object_id, predicate) in [
            ("note_both", q.as_str(), "related_to"),
            ("note_both", h.as_str(), "references"),
            ("note_one", h.as_str(), "references"),
        ] {
            conn.execute(
                "INSERT INTO relations(id,project_id,subject_id,predicate,object_id,origin,status,created_at)
                 VALUES(?,?,?,?,?,'agent','proposed','2026-01-01T00:00:00.000Z')",
                rusqlite::params![format!("rel_{subject}_{object_id}"), project_id, subject, predicate, object_id],
            )
            .unwrap();
        }
    }

    // Opening it again is what runs the migration.
    let db = Db::open(&path).unwrap();
    assert!(
        db.list_objects(&project_id, Some("note")).unwrap().is_empty(),
        "the note objects should be gone"
    );

    let by_title = |title: &str| {
        db.list_objects(&project_id, None)
            .unwrap()
            .into_iter()
            .find(|o| str_of(o, "title") == title)
            .unwrap_or_else(|| panic!("{title} should still be there"))
    };
    let question = by_title("Q");
    let hypothesis = by_title("H");
    let note_of = |o: &Value| o.get("note").and_then(Value::as_str).unwrap_or("").to_string();

    assert!(note_of(&question).contains("両方について"));
    assert!(note_of(&question).contains("本文A"));
    assert!(
        !note_of(&question).contains("仮説について"),
        "a note that was not about the question landed on it anyway"
    );
    // Two remarks on one object are kept, one after the other.
    assert!(note_of(&hypothesis).contains("両方について"));
    assert!(note_of(&hypothesis).contains("仮説について"));
    assert!(
        !db.list_objects(&project_id, None)
            .unwrap()
            .iter()
            .any(|o| note_of(o).contains("本文C")),
        "a note attached to nothing has nowhere to belong and is not carried anywhere"
    );
    // Opening it a third time must not write the remarks on a second time: the
    // notes are gone by then, so there is nothing left to fold.
    let once = note_of(&hypothesis);
    let reopened = Db::open(&path).unwrap();
    let again = reopened
        .list_objects(&project_id, None)
        .unwrap()
        .into_iter()
        .find(|o| str_of(o, "title") == "H")
        .expect("H should still be there");
    assert_eq!(once, note_of(&again));
}

// Archiving is the door 却下 is not. A confirmed claim that has been answered,
// superseded, or tested and found false is not a mistake and must not be
// deleted: it is the part of the research that was earned. So it is kept, it
// survives the purge that takes rejected objects, and it can come back.
#[test]
fn an_archived_object_is_kept_where_a_rejected_one_is_deleted() {
    let tmp = TempDir::new("archive");
    let research = tmp.path().join("research");
    std::fs::create_dir_all(&research).unwrap();

    let db = Db::open(&tmp.path().join("rescicle.sqlite")).unwrap();
    let project_id = str_of(
        &db.create_project("archive", research.to_str().unwrap()).unwrap(),
        "id",
    );
    let kept = str_of(
        &db.create_object(&project_id, &object("hypothesis", "反証された仮説", "researcher", "confirmed"), "researcher").unwrap(),
        "id",
    );
    let thrown = str_of(
        &db.create_object(&project_id, &object("hypothesis", "取り違えた仮説", "agent", "proposed"), "agent").unwrap(),
        "id",
    );

    db.update_object_status(&kept, "archived", "researcher").unwrap();
    db.update_object_status(&thrown, "rejected", "researcher").unwrap();

    // Long past the grace period both have been sitting through.
    db.purge_rejected_before(&project_id, "9999-01-01T00:00:00.000Z").unwrap();

    let archived = db.get_object(&kept).unwrap().expect("an archived object is kept");
    assert_eq!(str_of(&archived, "status"), "archived");
    assert!(
        db.get_object(&thrown).unwrap().is_none(),
        "a rejected object is still deleted"
    );

    // And archiving is not a one-way door, because nothing was destroyed.
    db.update_object_status(&kept, "confirmed", "researcher").unwrap();
    assert_eq!(
        str_of(&db.get_object(&kept).unwrap().unwrap(), "status"),
        "confirmed"
    );
}
