// Public so the integration tests under tests/ can drive these directly.
pub mod agent;
pub mod claude_agent;
pub mod commands;
pub mod db;
pub mod domain;
pub mod error;
pub mod files;
pub mod mcp;
pub mod partial;
pub mod settings;

use tauri::Manager;

fn debug_log(hypothesis_id: &str, message: &str, data: &str) {
    // #region agent log
    let line = format!(
        "{{\"sessionId\":\"2b0f2d\",\"runId\":\"exe-crash\",\"hypothesisId\":\"{hypothesis_id}\",\"location\":\"lib.rs\",\"message\":\"{}\",\"data\":{data},\"timestamp\":{}}}\n",
        message.replace('\\', "\\\\").replace('"', "\\\""),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(r"C:\Users\s3ima\projects\rescicle-first-user-v2\debug-2b0f2d.log")
    {
        use std::io::Write;
        let _ = file.write_all(line.as_bytes());
    }
    // #endregion
}

pub fn run() {
    let msystem = std::env::var("MSYSTEM").unwrap_or_default();
    let args: Vec<String> = std::env::args().collect();
    debug_log(
        "F",
        "run() entered",
        &format!(
            "{{\"msystem\":\"{msystem}\",\"argCount\":{}}}",
            args.len()
        ),
    );

    // Claude Code launches the same binary with --mcp-server to reach the local MCP
    // server over stdio. That mode never opens a window, so it skips the whole Tauri
    // runtime and just serves the JSON-RPC loop.
    if std::env::args().any(|arg| arg == "--mcp-server") {
        debug_log("F", "taking --mcp-server path", "{\"mcp\":true}");
        if let Err(error) = mcp::run_stdio() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            debug_log("G", "setup() entered", "{}");
            match commands::init_state(&app.handle()) {
                Ok(state) => {
                    debug_log("G", "init_state ok", "{}");
                    app.manage(state);
                    Ok(())
                }
                Err(error) => {
                    debug_log(
                        "G",
                        "init_state failed",
                        &format!(
                            "{{\"error\":\"{}\"}}",
                            error.to_string().replace('\\', "\\\\").replace('"', "\\\"")
                        ),
                    );
                    Err(error.into())
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_bootstrap,
            commands::project_choose_folder,
            commands::project_create,
            commands::project_open,
            commands::project_rename,
            commands::project_set_root,
            commands::objects_list,
            commands::object_get,
            commands::object_set_status,
            commands::relation_set_status,
            commands::messages_list,
            commands::files_scan,
            commands::asset_register,
            commands::agent_status,
            commands::agent_refresh,
            commands::agent_send,
            commands::claude_setup_info,
            commands::claude_copy_setup,
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| {
            debug_log(
                "H",
                "tauri build failed",
                &format!(
                    "{{\"error\":\"{}\"}}",
                    error.to_string().replace('\\', "\\\\").replace('"', "\\\"")
                ),
            );
            panic!("rescicleの起動に失敗しました: {error}");
        });

    debug_log("H", "build ok, starting event loop", "{}");
    app.run(|_handle, event| match event {
        tauri::RunEvent::Ready => debug_log("H", "RunEvent Ready", "{}"),
        tauri::RunEvent::ExitRequested { .. } => debug_log("H", "RunEvent ExitRequested", "{}"),
        tauri::RunEvent::Exit => debug_log("H", "RunEvent Exit", "{}"),
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } => debug_log(
            "H",
            "window destroyed",
            &format!("{{\"label\":\"{label}\"}}"),
        ),
        _ => {}
    });
}
