// Public so tests/ can drive the same entry points the old scripts/*.cjs tests did.
pub mod agent;
pub mod claude_agent;
pub mod commands;
pub mod db;
pub mod domain;
pub mod error;
pub mod files;
pub mod mcp;
pub mod settings;

use tauri::Manager;

pub fn run() {
    // Claude Code launches the same binary with --mcp-server to reach the local MCP
    // server over stdio. That mode never opens a window, so it skips the whole Tauri
    // runtime and just serves the JSON-RPC loop.
    if std::env::args().any(|arg| arg == "--mcp-server") {
        if let Err(error) = mcp::run_stdio() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = commands::init_state(&app.handle())?;
            app.manage(state);
            Ok(())
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
            commands::messages_list,
            commands::files_scan,
            commands::asset_register,
            commands::agent_status,
            commands::agent_refresh,
            commands::agent_send,
            commands::claude_setup_info,
            commands::claude_copy_setup,
        ])
        .run(tauri::generate_context!())
        .expect("rescicleの起動に失敗しました");
}
