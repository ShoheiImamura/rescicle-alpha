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
