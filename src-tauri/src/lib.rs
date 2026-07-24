//! LumaLink Streaming App (client) — a thin native shell around the same
//! React/TypeScript UI that runs on the LumaLink website.
//!
//! There is intentionally very little Rust here: the actual streaming
//! logic (WebRTC signaling, `RTCPeerConnection`, input forwarding) lives
//! in `src/services/streaming/WebRtcStreamingEngine.ts` and runs inside
//! this app's webview exactly as it does in a browser, since WebView2 /
//! WKWebView / WebKitGTK all support `RTCPeerConnection` natively. This
//! app's only job is to package that UI as a real, installable desktop
//! app (see `tauri.conf.json`'s `bundle.targets: ["msi"]`), plus a
//! couple of OS-level things a browser tab simply can't do: sending a
//! raw Wake-on-LAN UDP packet (`wol.rs`) and listening for LAN
//! broadcast announcements from LumaLink Host apps (`discovery.rs`).

mod discovery;
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
        .invoke_handler(tauri::generate_handler![send_wake_on_lan, discover_hosts])
        .run(tauri::generate_context!())
        .expect("error while running the LumaLink streaming app");
}
