use std::sync::Mutex;
use tokio::sync::mpsc::UnboundedSender;

/// Shared between the Tauri commands (called from the host's own webview
/// UI) and the background WebSocket signaling relay (`signaling.rs`).
///
/// `host_tx` / `client_tx` hold a channel to whichever single host/client
/// WebSocket connection is currently open, so text frames received on one
/// socket can be relayed to the other. Only one client is supported at a
/// time in this demo-grade implementation.
pub struct SignalingState {
    pub pin: Mutex<String>,
    pub host_tx: Mutex<Option<UnboundedSender<String>>>,
    pub client_tx: Mutex<Option<UnboundedSender<String>>>,
}

impl SignalingState {
    pub fn new() -> Self {
        Self {
            pin: Mutex::new(generate_pin()),
            host_tx: Mutex::new(None),
            client_tx: Mutex::new(None),
        }
    }
}

/// A fresh random 4-digit PIN, matching the format shown in the LumaLink
/// web/streaming app's pairing screens.
pub fn generate_pin() -> String {
    use rand::Rng;
    let n: u32 = rand::thread_rng().gen_range(0..10_000);
    format!("{n:04}")
}
