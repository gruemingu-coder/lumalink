//! LumaLink Streaming App (client) — a thin native shell around the same
//! React/TypeScript UI that runs on the LumaLink website.
//!
//! There is intentionally very little Rust here: the actual streaming
//! logic (WebRTC signaling, `RTCPeerConnection`, input forwarding) lives
//! in `src/services/streaming/WebRtcStreamingEngine.ts` and runs inside
//! this app's webview exactly as it does in a browser, since WebView2 /
//! WKWebView / WebKitGTK all support `RTCPeerConnection` natively. This
//! app's only job is to package that UI as a real, installable desktop
//! app (see `tauri.conf.json`'s `bundle.targets: ["msi"]`).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the LumaLink streaming app");
}
