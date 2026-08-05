//! Periodically broadcasts this host's presence on the LAN via UDP so
//! the AlaveX Streaming *desktop* app (not a plain browser tab —
//! browsers have no API for raw UDP) can auto-discover it instead of
//! the user typing in an IP address by hand. Kept intentionally
//! unauthenticated/low-info: only a display name and the signaling
//! port are announced, never the PIN, so discovery alone can't be
//! used to connect.

use crate::signaling::{host_display_name, SIGNALING_PORT};
use crate::state::SignalingState;
use std::net::UdpSocket;
use std::sync::Arc;
use std::time::Duration;

/// Distinct from `SIGNALING_PORT` (58712). Kept in sync with the
/// AlaveX Streaming app's `src-tauri/src/discovery.rs`.
pub const DISCOVERY_PORT: u16 = 58713;

pub async fn run(state: Arc<SignalingState>) {
    let Ok(socket) = UdpSocket::bind("0.0.0.0:0") else {
        eprintln!("AlaveX discovery broadcaster failed to bind a socket");
        return;
    };
    if socket.set_broadcast(true).is_err() {
        eprintln!("AlaveX discovery broadcaster failed to enable broadcast");
        return;
    }

    let mut last_payload = String::new();
    loop {
        let payload = serde_json::json!({
            "type": "alavex-host-announce",
            "name": host_display_name(),
            "signalPort": SIGNALING_PORT,
            "clientCount": state.client_count(),
            "protocol": "LLU2",
        })
        .to_string();
        // Always announce, but avoid redundant identical floods when nothing changed
        // by slightly backing off (still ≤5s so discovery stays snappy).
        let interval = if payload == last_payload {
            Duration::from_secs(5)
        } else {
            Duration::from_secs(2)
        };
        last_payload = payload.clone();
        let _ = socket.send_to(payload.as_bytes(), ("255.255.255.255", DISCOVERY_PORT));
        tokio::time::sleep(interval).await;
    }
}
