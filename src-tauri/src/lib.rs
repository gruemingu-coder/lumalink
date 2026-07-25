//! LumaLink Streaming App (client) — Tauri shell around the React UI.
//!
//! Native DXGI+NVENC path: TCP media client (`media_client`) bridges
//! Annex-B H.264 into the webview for WebCodecs decode. Legacy WebRTC
//! remains available as a fallback transport in the TypeScript layer.

mod discovery;
mod media_client;
mod wol;

#[tauri::command]
fn send_wake_on_lan(mac: String) -> Result<(), String> {
    wol::send_magic_packet(&mac)
}

#[tauri::command]
fn discover_hosts(timeout_ms: u64) -> Result<Vec<discovery::DiscoveredHost>, String> {
    discovery::discover(timeout_ms)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            send_wake_on_lan,
            discover_hosts,
            media_client::media_connect,
            media_client::media_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running the LumaLink streaming app");
}
