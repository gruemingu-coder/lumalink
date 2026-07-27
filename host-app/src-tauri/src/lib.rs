mod discovery;
mod input;
mod media;
mod network;
mod signaling;
mod state;
mod steam;

use state::SignalingState;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

#[tauri::command]
fn get_pin(state: tauri::State<Arc<SignalingState>>) -> String {
    state.pin.lock().unwrap().clone()
}

#[tauri::command]
fn regenerate_pin(state: tauri::State<Arc<SignalingState>>) -> String {
    let new_pin = state::generate_pin();
    *state.pin.lock().unwrap() = new_pin.clone();
    if let Some(media) = &state.media {
        media.set_pin(new_pin.clone());
    }
    new_pin
}

#[tauri::command]
fn start_native_stream(
    state: tauri::State<Arc<SignalingState>>,
    fps: u32,
    bitrate_mbps: u32,
    host_audio: Option<bool>,
) -> Result<String, String> {
    let Some(media) = &state.media else {
        return Err("네이티브 캡처를 사용할 수 없습니다.".into());
    };
    media.start_stream(1920, 1080, fps, bitrate_mbps, host_audio.unwrap_or(true));
    Ok(match media.preferred_backend() {
        media::EncoderBackend::Nvenc => "nvenc".into(),
        media::EncoderBackend::Software => "software".into(),
    })
}

#[tauri::command]
fn media_stats(state: tauri::State<Arc<SignalingState>>) -> Option<media::MediaStats> {
    state.media.as_ref().map(|m| m.snapshot_stats())
}

#[tauri::command]
fn stop_native_stream(state: tauri::State<Arc<SignalingState>>) {
    if let Some(media) = &state.media {
        media.stop_stream();
    }
}

#[tauri::command]
fn capture_backend(state: tauri::State<Arc<SignalingState>>) -> String {
    match state.media.as_ref().map(|m| m.preferred_backend()) {
        Some(media::EncoderBackend::Nvenc) => "nvenc".into(),
        _ => "software".into(),
    }
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
fn launch_custom_program(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("실행할 프로그램 경로가 비어 있습니다.".to_string());
    }
    // Reject shell metacharacters — path must be a direct executable.
    if trimmed.chars().any(|c| matches!(c, '&' | '|' | '>' | '<' | '^' | '\n' | '\r' | '%')) {
        return Err("프로그램 경로에 허용되지 않는 문자가 있습니다.".to_string());
    }
    let p = std::path::Path::new(trimmed);
    if !p.is_absolute() {
        return Err("프로그램 경로는 절대 경로여야 합니다.".to_string());
    }
    if !p.exists() {
        return Err("지정한 프로그램 경로가 존재하지 않습니다.".to_string());
    }
    std::process::Command::new(trimmed)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("프로그램을 실행하지 못했습니다: {e}"))
}

#[tauri::command]
fn get_mac_address() -> Option<String> {
    network::primary_mac_address()
}

#[derive(serde::Serialize)]
struct DeviceInfo {
    name: String,
    #[serde(rename = "macAddress")]
    mac_address: Option<String>,
    #[serde(rename = "localIp")]
    local_ip: Option<String>,
    #[serde(rename = "signalPort")]
    signal_port: u16,
}

#[tauri::command]
fn get_device_info() -> DeviceInfo {
    DeviceInfo {
        name: signaling::host_display_name(),
        mac_address: network::primary_mac_address(),
        local_ip: network::local_ipv4(),
        signal_port: signaling::SIGNALING_PORT,
    }
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
    let pin = state::generate_pin();
    let hub = Arc::new(media::MediaHub::new(pin.clone()));
    media::spawn(hub.clone());

    let shared_state = Arc::new(SignalingState::new(Some(hub)));
    *shared_state.pin.lock().unwrap() = pin;

    let relay_state = shared_state.clone();
    let discovery_state = shared_state.clone();
    let tray_state = shared_state.clone();
    let tip_state = shared_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            get_pin,
            regenerate_pin,
            start_native_stream,
            stop_native_stream,
            media_stats,
            capture_backend,
            get_installed_games,
            launch_game,
            launch_big_picture,
            launch_custom_program,
            get_mac_address,
            get_device_info,
            inject_input,
            signaling_port,
            get_client_count
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(move |app| {
            tauri::async_runtime::spawn(signaling::run(relay_state));
            tauri::async_runtime::spawn(discovery::run(discovery_state));

            let show_item = MenuItem::with_id(app, "show", "열기", true, None::<&str>)?;
            let regen_item =
                MenuItem::with_id(app, "regen_pin", "PIN 재발급", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &regen_item, &quit_item])?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("LumaLink Host")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "regen_pin" => {
                        let new_pin = state::generate_pin();
                        *tray_state.pin.lock().unwrap() = new_pin.clone();
                        if let Some(media) = &tray_state.media {
                            media.set_pin(new_pin);
                        }
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("lumalink-pin-rotated", ());
                            let _ = window.show();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            let tray_icon = tray.build(app)?;

            let tip_tray = tray_icon.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    let n = tip_state.client_count();
                    let pin = tip_state.pin.lock().unwrap().clone();
                    let _ = tip_tray.set_tooltip(Some(format!(
                        "LumaLink Host · PIN {pin} · clients {n}"
                    )));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the LumaLink host app");
}
