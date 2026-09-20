// Exercises the real Claude Code CLI, so it is ignored by default: CI has no
// claude binary and no session. Run it on a developer machine with
//   cargo test --test claude_cli -- --ignored --nocapture
use rescicle_lib::claude_agent::{resolve_claude_bin, ClaudeAgent};

#[test]
#[ignore = "needs a locally installed claude CLI"]
fn discovers_and_runs_the_cli() {
    let found = resolve_claude_bin();
    println!("resolve_claude_bin -> {found:?}");
    assert!(found.is_some(), "claude CLI not found on PATH or in the usual places");

    let dir = std::env::temp_dir().join(format!("rescicle-cli-{}", uuid::Uuid::new_v4()));
    let agent = ClaudeAgent::new(&dir).unwrap();
    let status = tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(agent.status());
    println!("status -> {status}");

    assert_eq!(status["available"], true, "status reported: {status}");
    assert!(status["version"].as_str().unwrap_or("").contains("Claude"));
    let _ = std::fs::remove_dir_all(&dir);
}

// One real conversation turn, end to end: the prompt the app would build, the
// system prompt and schema it embeds, a live CLI turn, and the operations coming
// back applied to a real database. This is what agent_send does either side of
// its await, so it covers the primary path without the Tauri command layer.
#[test]
#[ignore = "spends a real Claude Code turn"]
fn a_real_turn_produces_research_objects() {
    use rescicle_lib::agent::{apply_operations, build_prompt};
    use rescicle_lib::db::Db;
    use rescicle_lib::files::scan_files;

    let tmp = std::env::temp_dir().join(format!("rescicle-turn-{}", uuid::Uuid::new_v4()));
    let research = tmp.join("research");
    std::fs::create_dir_all(&research).unwrap();
    std::fs::write(
        research.join("20K.csv"),
        "temperature,resistance\n20,10.2\n25,3.1\n",
    )
    .unwrap();

    let db = Db::open(&tmp.join("rescicle.sqlite")).unwrap();
    let project = db
        .create_project("低温測定", research.to_str().unwrap())
        .unwrap();
    let project_id = project["id"].as_str().unwrap().to_string();

    let files = scan_files(&research, 120);
    let prompt = build_prompt(
        &db,
        &project_id,
        "20Kと25Kで試料の抵抗を測ったら、25Kで急に下がった。何か相転移が起きている気がする。",
        None,
        &files,
        &[],
    )
    .unwrap();
    println!("--- prompt: {} bytes ---", prompt.len());

    let agent = ClaudeAgent::new(&tmp.join("agent-workspace")).unwrap();
    let mut session: Option<String> = None;

    // Collect what the app would push to the window while the turn runs.
    let chunks = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let sink = chunks.clone();
    let on_text = move |text: &str| {
        if let Ok(mut got) = sink.lock() {
            got.push(text.to_string());
        }
    };

    let structured = tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(agent.structured_turn(&mut session, &prompt, Some(&on_text)))
        .expect("the turn should come back as the schema says");

    let chunks = chunks.lock().unwrap().clone();
    println!("--- streamed in {} chunks ---", chunks.len());
    assert!(
        chunks.len() > 1,
        "the turn arrived in one piece, so nothing could have been shown while it ran"
    );
    // What the screen was showing has to end up as the reply that gets stored.
    let streamed = rescicle_lib::partial::partial_reply(&chunks.concat())
        .expect("the reply should be readable from the streamed document");
    assert_eq!(
        streamed, structured.reply,
        "the streamed text and the parsed reply disagree"
    );

    println!("--- reply ---\n{}", structured.reply);
    println!("--- operations: {} ---", structured.operations.len());
    for op in &structured.operations {
        println!("  {} {:?} {:?}", op.op, op.object_type, op.title);
    }

    assert!(!structured.reply.trim().is_empty(), "the reply must not be empty");
    assert!(session.is_some(), "the session id must come back for the next turn");

    let applied = apply_operations(&db, &research, &project_id, &structured.operations);
    println!("--- applied ---");
    for record in &applied {
        println!("  {record}");
    }
    let failures: Vec<_> = applied.iter().filter(|r| r["ok"] != true).collect();
    assert!(failures.is_empty(), "operations were rejected: {failures:?}");

    let stored = db.list_objects(&project_id, None).unwrap();
    println!("--- stored objects: {} ---", stored.len());
    for object in &stored {
        println!("  {} {} [{}] {}", object["type"], object["origin"], object["status"], object["title"]);
    }
    assert!(!stored.is_empty(), "the turn produced no research objects");
    // PRODUCT_SCOPE: agent-generated scientific content starts as `proposed`.
    // Assets are the stated exception, because register_asset records a file
    // that is already on disk rather than a claim about the world.
    for object in &stored {
        if object["type"] == "asset" {
            assert_eq!(object["origin"], "system");
            continue;
        }
        assert_eq!(
            object["status"], "proposed",
            "scientific output must start proposed: {object}"
        );
    }

    let _ = std::fs::remove_dir_all(&tmp);
}

// The whole point of taking the share buttons away: the agent is shown names and
// decides for itself which file it needs, rescicle reads that one, and the
// second turn answers from it. Two real turns, so it is ignored by default.
#[test]
#[ignore = "spends two real Claude Code turns"]
fn the_agent_asks_for_the_file_it_needs_and_answers_from_it() {
    use rescicle_lib::agent::{build_prompt, read_requested};
    use rescicle_lib::db::Db;
    use rescicle_lib::files::scan_files;

    let tmp = std::env::temp_dir().join(format!("rescicle-read-{}", uuid::Uuid::new_v4()));
    let research = tmp.join("research");
    std::fs::create_dir_all(&research).unwrap();
    // The answer is in one of these and nowhere else, so asking for it is the
    // only way the turn can get it right.
    std::fs::write(
        research.join("t2_vs_depth.csv"),
        "depth_nm,t2_us\n5,12.4\n8,21.0\n12,44.8\n18,79.2\n",
    )
    .unwrap();
    std::fs::write(research.join("notes.md"), "# 雑記\n装置の予約を取る\n").unwrap();
    std::fs::write(research.join("readme.txt"), "このフォルダは測定用です\n").unwrap();

    let db = Db::open(&tmp.join("rescicle.sqlite")).unwrap();
    let project = db
        .create_project("NV測定", research.to_str().unwrap())
        .unwrap();
    let project_id = project["id"].as_str().unwrap().to_string();
    let files = scan_files(&research, 120);

    let question = "深さとT2の関係を測ったデータがこのフォルダにあるはず。いちばん浅い点と深い点で、T2は何倍ちがう？";
    let first = build_prompt(&db, &project_id, question, None, &files, &[]).unwrap();

    let agent = ClaudeAgent::new(&tmp.join("agent-workspace")).unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let mut session: Option<String> = None;

    let asked = runtime
        .block_on(agent.structured_turn(&mut session, &first, None))
        .expect("the first turn should come back as the schema says");
    let wanted = asked.read_files.clone().unwrap_or_default();
    println!("--- turn 1 read_files: {wanted:?} ---");
    println!("--- turn 1 reply ---\n{}", asked.reply);
    assert!(
        wanted.iter().any(|p| p.contains("t2_vs_depth")),
        "the agent did not ask for the file the answer is in: {wanted:?}"
    );

    let read = read_requested(&research, &wanted, 4);
    assert!(!read.is_empty(), "rescicle read nothing for a file that is there");
    for file in &read {
        println!("--- read {} ({} bytes) ---", file.path, file.text.len());
    }

    let second = build_prompt(&db, &project_id, question, None, &files, &read).unwrap();
    let answered = runtime
        .block_on(agent.structured_turn(&mut session, &second, None))
        .expect("the second turn should come back as the schema says");
    println!("--- turn 2 reply ---\n{}", answered.reply);

    // 79.2 / 12.4 is about 6.4, and it can only know that from the file.
    let reply = answered.reply.clone();
    assert!(
        reply.contains("6.4") || reply.contains("6.3") || reply.contains("６.４"),
        "the answer does not carry the number the file gives: {reply}"
    );
    let _ = std::fs::remove_dir_all(&tmp);
}
