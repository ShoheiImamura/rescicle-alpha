// Windows: no console window behind the app, but --mcp-server still needs stdio,
// which a GUI subsystem binary keeps when a parent hands it pipes.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rescicle_lib::run()
}
