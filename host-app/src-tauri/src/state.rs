use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tokio::sync::mpsc::UnboundedSender;

/// Shared between the Tauri commands (called from the host's own webview
/// UI) and the background WebSocket signaling relay (`signaling.rs`).
///
/// `host_tx` holds a channel to the host's own webview connection.
/// `clients` maps each connected client's `clientId` to a channel for
/// its socket, so the relay can support **multiple simultaneous
/// clients** sharing the one PIN — every relayed message between the
/// host and a client is tagged with that client's id (see
/// `signalingProtocol.ts`'s doc comment) so the host's webview (which
/// runs one `RTCPeerConnection` per client) can tell sessions apart.
pub struct SignalingState {
    pub pin: Mutex<String>,
    pub host_tx: Mutex<Option<UnboundedSender<String>>>,
    pub clients: Mutex<HashMap<String, UnboundedSender<String>>>,
    next_client_id: AtomicU64,
}

impl SignalingState {
    pub fn new() -> Self {
        Self {
            pin: Mutex::new(generate_pin()),
            host_tx: Mutex::new(None),
            clients: Mutex::new(HashMap::new()),
            next_client_id: AtomicU64::new(1),
        }
    }

    pub fn next_client_id(&self) -> String {
        let n = self.next_client_id.fetch_add(1, Ordering::Relaxed);
        format!("c{n}")
    }

    pub fn client_count(&self) -> usize {
        self.clients.lock().unwrap().len()
    }
}

/// A fresh random 4-digit PIN, matching the format shown in the LumaLink
/// web/streaming app's pairing screens.
pub fn generate_pin() -> String {
    use rand::Rng;
    let n: u32 = rand::thread_rng().gen_range(0..10_000);
    format!("{n:04}")
}
