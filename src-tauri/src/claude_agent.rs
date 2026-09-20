use crate::agent::{system_prompt, Structured};
use crate::error::{err, Error, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

const TIMEOUT: Duration = Duration::from_millis(180_000);

/// The name rescicle registers itself under in Claude Code's MCP config.
const MCP_NAME: &str = "rescicle";

// What went wrong, said in the CLI's own words where it said anything at all.
fn failure_detail(run: &Run) -> String {
    for text in [&run.err, &run.out] {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return trimmed.chars().take(200).collect();
        }
    }
    format!("exit {}", run.code)
}

// `claude mcp get` prints one `Label: value` per line.
fn reported_field(text: &str, label: &str) -> Option<String> {
    text.lines()
        .find_map(|line| line.trim().strip_prefix(label))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

// On Windows the same file can be written in either case and with either
// separator, and none of that makes it a different file. A registration counts
// as stale only when it names something else.
fn same_path(left: &str, right: &str) -> bool {
    fn normalise(path: &str) -> String {
        let trimmed = path.trim().trim_matches('"');
        if cfg!(windows) {
            trimmed.replace('/', "\\").to_lowercase()
        } else {
            trimmed.to_string()
        }
    }
    normalise(left) == normalise(right)
}

/// Called with each chunk of assistant text as the CLI produces it.
pub type OnText = dyn Fn(&str) + Send + Sync;

// The CLI's stream-json output is one JSON event per line. Only two matter: the
// text deltas, which are what makes the wait bearable, and the closing `result`
// event, which carries exactly the envelope `--output-format json` used to
// return whole. Everything else is passed over.
fn delta_text(event: &Value) -> Option<String> {
    let inner = event.get("event")?;
    if inner.get("type")?.as_str()? != "content_block_delta" {
        return None;
    }
    let delta = inner.get("delta")?;
    if delta.get("type")?.as_str()? != "text_delta" {
        return None;
    }
    Some(delta.get("text")?.as_str()?.to_string())
}

fn candidate_bins() -> Vec<PathBuf> {
    let mut list = Vec::new();
    if let Ok(override_bin) = std::env::var("RESCICLE_CLAUDE_BIN") {
        list.push(PathBuf::from(override_bin));
    }
    let exe = if cfg!(windows) { "claude.exe" } else { "claude" };
    if let Some(home) = dirs::home_dir() {
        list.push(home.join(".local").join("bin").join(exe));
        list.push(home.join(".claude").join("local").join(exe));
    }
    let names: &[&str] = if cfg!(windows) {
        &["claude.exe", "claude.cmd", "claude.bat"]
    } else {
        &["claude"]
    };
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in names {
                list.push(dir.join(name));
            }
        }
    }
    list
}

// Claude Code is a user-installed CLI, so its location is discovered rather than
// bundled.
pub fn resolve_claude_bin() -> Option<PathBuf> {
    candidate_bins()
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn strip_fence(text: &str) -> String {
    let trimmed = text.trim();
    if !trimmed.starts_with("```") {
        return trimmed.to_string();
    }
    let without_open = trimmed
        .strip_prefix("```")
        .map(|rest| match rest.find('\n') {
            // Drop the language tag on the opening fence, if there is one.
            Some(newline) if !rest[..newline].contains(' ') => &rest[newline + 1..],
            _ => rest,
        })
        .unwrap_or(trimmed);
    without_open
        .trim_end()
        .strip_suffix("```")
        .unwrap_or(without_open)
        .trim()
        .to_string()
}

pub fn parse_structured(result_text: &str) -> Option<Structured> {
    let text = strip_fence(result_text);
    if let Ok(parsed) = serde_json::from_str::<Structured>(&text) {
        return Some(parsed);
    }
    // The model sometimes wraps the object in a sentence. Take the outermost braces
    // and try again before giving up and asking it to repeat itself.
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str::<Structured>(&text[start..=end]).ok()
}

struct Run {
    code: i32,
    out: String,
    err: String,
}

pub struct ClaudeAgent {
    work_dir: PathBuf,
    // Interior mutability so every method takes &self: the async commands must not
    // hold a lock across an await, and the only mutation is re-running discovery
    // after the researcher installs the CLI.
    bin: std::sync::Mutex<Option<PathBuf>>,
}

impl ClaudeAgent {
    pub fn new(work_dir: &Path) -> Result<Self> {
        crate::agent::ensure_agent_workspace(work_dir)?;
        Ok(Self {
            work_dir: work_dir.to_path_buf(),
            bin: std::sync::Mutex::new(resolve_claude_bin()),
        })
    }

    fn bin(&self) -> Option<PathBuf> {
        self.bin.lock().ok().and_then(|guard| guard.clone())
    }

    pub fn refresh_bin(&self) {
        if let Ok(mut guard) = self.bin.lock() {
            *guard = resolve_claude_bin();
        }
    }

    async fn run(&self, args: &[String], stdin: Option<&str>, on_text: Option<&OnText>) -> Result<Run> {
        let Some(bin) = self.bin() else {
            return err("Claude Codeが見つかりません。claudeコマンドをインストールしてから再試行してください。");
        };

        let mut command = Command::new(bin);
        command
            .args(args)
            .current_dir(&self.work_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Dropping the future on timeout has to take the CLI down with it,
            // otherwise a hung turn leaks a process for the life of the app.
            .kill_on_drop(true);
        #[cfg(windows)]
        {
            // Without this the CLI gets its own console window on Windows.
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command.spawn()?;
        if let Some(mut pipe) = child.stdin.take() {
            if let Some(data) = stdin {
                pipe.write_all(data.as_bytes()).await?;
            }
            pipe.shutdown().await.ok();
        }

        let stdout = child.stdout.take().expect("stdout is piped");
        let stderr = child.stderr.take().expect("stderr is piped");
        // Drained on its own task: stdout is now read to the end before the
        // child is reaped, and a filled stderr pipe would block the child
        // there forever.
        let draining = tokio::spawn(async move {
            let mut text = String::new();
            let _ = BufReader::new(stderr).read_to_string(&mut text).await;
            text
        });

        let collect = async {
            let mut raw = String::new();
            let mut envelope = None;
            let mut lines = BufReader::new(stdout).lines();
            while let Some(line) = lines.next_line().await? {
                if let Ok(event) = serde_json::from_str::<Value>(&line) {
                    match event.get("type").and_then(Value::as_str) {
                        Some("stream_event") => {
                            if let (Some(report), Some(text)) = (on_text, delta_text(&event)) {
                                report(&text);
                            }
                        }
                        Some("result") => envelope = Some(line.clone()),
                        _ => {}
                    }
                }
                raw.push_str(&line);
                raw.push('\n');
            }
            Ok::<_, Error>((raw, envelope))
        };

        let (raw, envelope) = match tokio::time::timeout(TIMEOUT, collect).await {
            Err(_) => return err("Claude Codeの応答がタイムアウトしました。"),
            Ok(result) => result?,
        };
        let status = child.wait().await?;

        Ok(Run {
            code: status.code().unwrap_or(-1),
            // `--version` prints plain text and has no result event, so it falls
            // back to everything that was printed.
            out: envelope.unwrap_or(raw),
            err: draining.await.unwrap_or_default(),
        })
    }

    pub async fn status(&self) -> Value {
        let Some(bin) = self.bin() else {
            return json!({
                "available": false, "provider": "claude",
                "error": "claudeコマンドが見つかりません", "bin": null, "version": null
            });
        };
        let bin = bin.to_string_lossy().into_owned();
        match self.run(&["--version".to_string()], None, None).await {
            Err(error) => json!({
                "available": false, "provider": "claude",
                "error": error.to_string(), "bin": bin, "version": null
            }),
            Ok(run) if run.code != 0 => json!({
                "available": false, "provider": "claude",
                "error": failure_detail(&run), "bin": bin, "version": null
            }),
            Ok(run) => json!({
                "available": true, "provider": "claude", "error": null, "bin": bin,
                "version": run.out.trim().lines().next().unwrap_or("").to_string()
            }),
        }
    }

    // What Claude Code has registered is read back rather than remembered here.
    // Its config is the one that decides, and the researcher can change it from a
    // terminal at any time. `mcp get` exits non-zero when nothing is registered
    // under the name and prints the command line when something is, which is how
    // a registration left behind by an earlier build is told from a current one.
    pub async fn mcp_status(&self, exe: &str) -> Value {
        if self.bin().is_none() {
            return json!({
                "checked": false, "registered": false, "command": null,
                "stale": false, "error": "claudeコマンドが見つかりません"
            });
        }
        let args = ["mcp", "get", MCP_NAME].map(String::from);
        match self.run(&args, None, None).await {
            Err(error) => json!({
                "checked": false, "registered": false, "command": null,
                "stale": false, "error": error.to_string()
            }),
            // Not registered is an answer rather than a failure: it is what the
            // researcher opened this screen to fix.
            Ok(run) if run.code != 0 => json!({
                "checked": true, "registered": false, "command": null,
                "stale": false, "error": null
            }),
            Ok(run) => {
                let command = reported_field(&run.out, "Command:");
                let stale = command.as_deref().is_some_and(|found| !same_path(found, exe));
                json!({
                    "checked": true, "registered": true, "command": command,
                    "stale": stale, "error": null
                })
            }
        }
    }

    // Registering over a name that is already registered is refused, and a path
    // left behind by an earlier build is exactly what has to be replaced, so
    // whatever is there is taken out first. On a first run there is nothing to
    // remove, and that failing is the ordinary case rather than an error.
    pub async fn mcp_register(&self, exe: &str) -> Result<()> {
        let remove = ["mcp", "remove", "--scope", "user", MCP_NAME].map(String::from);
        let _ = self.run(&remove, None, None).await;

        let mut args: Vec<String> =
            ["mcp", "add", "--transport", "stdio", "--scope", "user", MCP_NAME, "--"]
                .iter()
                .map(|part| part.to_string())
                .collect();
        args.push(exe.to_string());
        args.push("--mcp-server".to_string());

        let run = self.run(&args, None, None).await?;
        if run.code != 0 {
            return err(format!(
                "Claude Codeへの登録に失敗しました: {}",
                failure_detail(&run)
            ));
        }
        Ok(())
    }

    // --strict-mcp-config keeps rescicle's own MCP server from being loaded back into
    // this child process. --allowedTools names the two web tools and nothing else: a
    // research copilot that cannot look up a compound or open the paper it just found
    // is missing the obvious half of the job, and the list being exact is what keeps
    // the rest shut. Read, Bash, Edit and Glob are all absent, so the research folder
    // is still reachable only through read_files, which rescicle performs and logs.
    //
    // Two things go out that did not before. The queries and URLs are written by the
    // model, which has the conversation and the object summaries in front of it, so a
    // search can carry the researcher's own wording to a search engine -- the folder
    // stays shut, the thinking does not. And what WebFetch brings back is text from a
    // page nobody vetted, arriving in the same context as the instructions; a hostile
    // page can ask for anything. What it can get is an operation, and every operation
    // is a proposal the researcher decides on, which is the same standing the agent
    // has had all along.
    //
    // The test below pins the list, so nothing joins it by accident.
    fn turn_args(session_id: &str, is_new: bool) -> Vec<String> {
        [
            "-p",
            // stream-json requires --verbose, and the partial messages are the
            // point of it: they are what reaches the screen while the turn runs.
            // Its closing `result` event carries the same envelope that
            // --output-format json used to return in one piece.
            "--verbose",
            "--output-format",
            "stream-json",
            "--include-partial-messages",
            "--system-prompt",
            &system_prompt(),
            "--allowedTools",
            "WebSearch,WebFetch",
            "--strict-mcp-config",
            if is_new { "--session-id" } else { "--resume" },
            session_id,
        ]
        .iter()
        .map(|s| s.to_string())
        .collect()
    }

    // One question, answered once, with nothing carried in or out. A fresh session
    // id every time, so what is asked here never joins the research conversation
    // and never has to be resumed; its own system prompt, because the caller is not
    // asking for the research schema; and an empty --allowedTools, because naming
    // something is not a reason to reach the web.
    //
    // --output-format json rather than the streamed form: there is no partial worth
    // showing for an answer that is one line, and run() takes the result event from
    // either shape.
    fn one_shot_args(system: &str, session_id: &str) -> Vec<String> {
        [
            "-p",
            "--output-format",
            "json",
            "--system-prompt",
            system,
            "--allowedTools",
            "",
            "--strict-mcp-config",
            "--session-id",
            session_id,
        ]
        .iter()
        .map(|s| s.to_string())
        .collect()
    }

    pub async fn one_shot(&self, system: &str, prompt: &str) -> Result<String> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let run = self
            .run(&Self::one_shot_args(system, &session_id), Some(prompt), None)
            .await?;
        let (text, _) = Self::interpret(&run, &session_id)?;
        Ok(text)
    }

    // Split out from turn() so the envelope contract can be tested without a
    // subprocess: it decides what counts as a failure and which session id the next
    // turn resumes. Returns the assistant text and that session id.
    fn interpret(run: &Run, session_id: &str) -> Result<(String, String)> {
        if run.code != 0 {
            let detail: String = if run.err.trim().is_empty() {
                run.out.trim().to_string()
            } else {
                run.err.trim().to_string()
            }
            .chars()
            .take(300)
            .collect();
            let detail = if detail.is_empty() {
                format!("exit {}", run.code)
            } else {
                detail
            };
            return err(format!("Claude Codeがエラーを返しました: {detail}"));
        }

        let Ok(envelope) = serde_json::from_str::<Value>(&run.out) else {
            let head: String = run.out.chars().take(300).collect();
            return err(format!("Claude Codeの出力を解釈できませんでした: {head}"));
        };
        if envelope.get("is_error").and_then(Value::as_bool) == Some(true) {
            let detail: String = envelope
                .get("result")
                .map(|r| r.as_str().map(str::to_string).unwrap_or_else(|| r.to_string()))
                .unwrap_or_default()
                .chars()
                .take(300)
                .collect();
            return err(format!("Claude Codeがエラーを返しました: {detail}"));
        }

        Ok((
            envelope
                .get("result")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            envelope
                .get("session_id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| session_id.to_string()),
        ))
    }

    async fn turn(&self, session: &mut Option<String>, prompt: &str, on_text: Option<&OnText>) -> Result<String> {
        let is_new = session.is_none();
        let mut session_id = session
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let mut run = self
            .run(&Self::turn_args(&session_id, is_new), Some(prompt), on_text)
            .await?;
        if run.code != 0 && !is_new {
            // The stored session can be gone (cleared history, another machine):
            // start a fresh one.
            session_id = uuid::Uuid::new_v4().to_string();
            run = self
                .run(&Self::turn_args(&session_id, true), Some(prompt), on_text)
                .await?;
        }

        let (text, resolved) = Self::interpret(&run, &session_id)?;
        *session = Some(resolved);
        Ok(text)
    }

    pub async fn structured_turn(
        &self,
        session: &mut Option<String>,
        prompt: &str,
        on_text: Option<&OnText>,
    ) -> Result<Structured> {
        if let Some(parsed) = parse_structured(&self.turn(session, prompt, on_text).await?) {
            return Ok(parsed);
        }
        // The repair turn is not streamed. It asks the model to restate what it
        // already said, and watching that arrive a second time is noise.
        let retry = self
            .turn(
                session,
                "Return the previous answer again as a single JSON object matching the schema, with no other text.",
                None,
            )
            .await?;
        match parse_structured(&retry) {
            Some(parsed) => Ok(parsed),
            None => err("Claude Codeが期待した形式のJSONを返しませんでした。"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(code: i32, out: &str, err: &str) -> Run {
        Run { code, out: out.into(), err: err.into() }
    }

    // These flags are the
    // contract with the CLI, and a silent change to any of them turns a reasoning
    // turn into something that can touch the researcher's machine.
    #[test]
    fn turn_args_hold_the_cli_contract() {
        let first = ClaudeAgent::turn_args("sess-1", true);
        let index = |flag: &str| first.iter().position(|a| a == flag);

        assert!(index("-p").is_some(), "-p is required for headless mode");
        assert_eq!(first[index("--output-format").unwrap() + 1], "stream-json");
        assert!(
            index("--include-partial-messages").is_some(),
            "without partial messages there is nothing to show during the turn"
        );
        assert!(index("--verbose").is_some(), "stream-json requires --verbose");
        assert!(
            index("--strict-mcp-config").is_some(),
            "rescicle's own MCP server must not load back into the child"
        );
        // Exact, not "contains WebSearch". The value of this flag is the whole of
        // what keeps the local machine out of the turn, so the assertion has to fail
        // on anything joining the list as much as on WebSearch leaving it.
        assert_eq!(
            first[index("--allowedTools").unwrap() + 1],
            "WebSearch,WebFetch",
            "the chat turn gets the two web tools and nothing else"
        );
        let allowed = &first[index("--allowedTools").unwrap() + 1];
        for reaches_the_machine in ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "NotebookEdit"] {
            assert!(
                !allowed.contains(reaches_the_machine),
                "{reaches_the_machine} would reach past the conversation; \
                 the research folder is read through read_files, which rescicle performs and logs"
            );
        }

        assert!(index("--session-id").is_some(), "first turn opens a new session");
        assert!(index("--resume").is_none());
        assert_eq!(first[index("--session-id").unwrap() + 1], "sess-1");

        let later = ClaudeAgent::turn_args("sess-1", false);
        assert!(later.iter().any(|a| a == "--resume"), "later turns resume");
        assert!(!later.iter().any(|a| a == "--session-id"));
        let resume = later.iter().position(|a| a == "--resume").unwrap();
        assert_eq!(later[resume + 1], "sess-1");
    }

    // The researcher prompt travels on stdin, never argv: it carries the whole
    // project context and would blow past the Windows command line limit.
    #[test]
    fn the_prompt_never_reaches_argv() {
        let args = ClaudeAgent::turn_args("sess-1", true);
        assert!(!args.iter().any(|a| a.contains("PROJECT CONTEXT")));
        assert!(!args.iter().any(|a| a.contains("CURRENT USER MESSAGE")));
        // The system prompt is the one long argument that does belong there.
        assert!(args.iter().any(|a| a.contains("rescicle research copilot")));
    }

    #[test]
    fn interpret_takes_the_session_id_forward() {
        let envelope = r#"{"type":"result","is_error":false,"result":"hello","session_id":"sess-9"}"#;
        let (text, session) = ClaudeAgent::interpret(&run(0, envelope, ""), "sess-1").unwrap();
        assert_eq!(text, "hello");
        assert_eq!(session, "sess-9", "the CLI's session id wins");

        // A turn that reports no session id keeps the one it was asked to use.
        let (_, session) =
            ClaudeAgent::interpret(&run(0, r#"{"result":"hi"}"#, ""), "sess-1").unwrap();
        assert_eq!(session, "sess-1");
    }

    #[test]
    fn interpret_rejects_failed_turns() {
        assert!(ClaudeAgent::interpret(&run(1, "", "boom"), "s").is_err());
        assert!(ClaudeAgent::interpret(&run(1, "", ""), "s").is_err());
        assert!(ClaudeAgent::interpret(&run(0, "not json", ""), "s").is_err());
        assert!(
            ClaudeAgent::interpret(&run(0, r#"{"is_error":true,"result":"nope"}"#, ""), "s")
                .is_err(),
            "an envelope flagged is_error is a failure even at exit 0"
        );
    }
}
