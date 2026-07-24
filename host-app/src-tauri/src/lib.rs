mod input;
mod signaling;
mod state;
mod steam;

use state::SignalingState;
use std::sync::Arc;

#[tauri::command]
fn get_pin(state: tauri::State<Arc<SignalingState>>) -> String {
    state.pin.lock().unwrap().clone()
}

#[tauri::command]
fn regenerate_pin(state: tauri::State<Arc<SignalingState>>) -> String {
    let new_pin = state::generate_pin();
    *state.pin.lock().unwrap() = new_pin.clone();
    new_pin
}

#[tauri::command]
fn get_installed_games() -> Vec<steam::InstalledGame> {
    steam::scan_installed_games()
}

#[tauri::command]
fn launch_game(game_id: String) -> Result<(), String> {
    steam::launch_game(&game_id)
}

#[tauri::command]
fn inject_input(event: input::InputEvent) -> Result<(), String> {
    input::inject(event)
}

#[tauri::command]
fn signaling_port() -> u16 {
    signaling::SIGNALING_PORT
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state = Arc::new(SignalingState::new());
    let relay_state = shared_state.clone();

    tauri::Builder::default()
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            get_pin,
            regenerate_pin,
            get_installed_games,
            launch_game,
            inject_input,
            signaling_port
        ])
        .setup(move |_app| {
            tauri::async_runtime::spawn(signaling::run(relay_state));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the LumaLink host app");
}
