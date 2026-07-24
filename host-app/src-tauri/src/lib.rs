mod discovery;
mod input;
mod network;
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
fn launch_big_picture() -> Result<(), String> {
    steam::launch_big_picture()
}

#[tauri::command]
fn get_mac_address() -> Option<String> {
    network::primary_mac_address()
}

#[tauri::command]
fn inject_input(event: input::InputEvent) -> Result<(), String> {
    input::inject(event)
}

#[tauri::command]
fn signaling_port() -> u16 {
    signaling::SIGNALING_PORT
}

#[tauri::command]
fn get_client_count(state: tauri::State<Arc<SignalingState>>) -> usize {
    state.client_count()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state = Arc::new(SignalingState::new());
    let relay_state = shared_state.clone();
    let discovery_state = shared_state.clone();

    tauri::Builder::default()
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            get_pin,
            regenerate_pin,
            get_installed_games,
            launch_game,
            launch_big_picture,
            get_mac_address,
            inject_input,
            signaling_port,
            get_client_count
        ])
        .setup(move |_app| {
            tauri::async_runtime::spawn(signaling::run(relay_state));
            tauri::async_runtime::spawn(discovery::run(discovery_state));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the LumaLink host app");
}
