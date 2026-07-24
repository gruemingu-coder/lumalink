//! Minimal WebSocket signaling relay for LumaLink.
//!
//! This server does NOT speak WebRTC itself — it just authenticates a
//! connecting client with a PIN and pipes JSON text frames between
//! exactly one "host" connection (this app's own webview, which does the
//! actual `getDisplayMedia()` + `RTCPeerConnection` work in JS) and one
//! "client" connection (a remote LumaLink Streaming App / browser tab).
//!
//! See `src/services/streaming/signalingProtocol.ts` in the main
//! LumaLink repo for the shared message shapes this relays untouched.

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::sync::mpsc;

use crate::state::SignalingState;

/// Fixed LAN port the host app listens on. Kept in sync with
/// `SIGNALING_PORT` in `signalingProtocol.ts`.
pub const SIGNALING_PORT: u16 = 58712;

pub async fn run(state: Arc<SignalingState>) {
    let app = Router::new()
        .route("/signal", get(ws_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], SIGNALING_PORT));
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            if let Err(err) = axum::serve(listener, app).await {
                eprintln!("LumaLink signaling server stopped: {err}");
            }
        }
        Err(err) => {
            eprintln!("LumaLink signaling server failed to bind :{SIGNALING_PORT} — {err}");
        }
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<SignalingState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, params, state))
}

async fn handle_socket(socket: WebSocket, params: HashMap<String, String>, state: Arc<SignalingState>) {
    let role = params.get("role").cloned().unwrap_or_default();
    let (mut sender, mut receiver) = socket.split();

    if role == "client" {
        let provided_pin = params.get("pin").cloned().unwrap_or_default();
        let expected_pin = state.pin.lock().unwrap().clone();
        if provided_pin != expected_pin {
            let fail = serde_json::json!({ "type": "auth-fail", "reason": "PIN이 올바르지 않습니다." });
            let _ = sender.send(Message::Text(fail.to_string())).await;
            return;
        }
    } else if role != "host" {
        // Unknown role — refuse the connection.
        return;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    if role == "host" {
        *state.host_tx.lock().unwrap() = Some(tx.clone());
    } else {
        *state.client_tx.lock().unwrap() = Some(tx.clone());
        let ok = serde_json::json!({ "type": "auth-ok", "hostName": host_display_name() });
        let _ = tx.send(ok.to_string());
        let host_tx = state.host_tx.lock().unwrap().clone();
        if let Some(host_tx) = host_tx {
            let _ = host_tx.send(serde_json::json!({ "type": "client-connected" }).to_string());
        }
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    let relay_role = role.clone();
    let relay_state = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                let other = if relay_role == "host" {
                    relay_state.client_tx.lock().unwrap().clone()
                } else {
                    relay_state.host_tx.lock().unwrap().clone()
                };
                if let Some(other_tx) = other {
                    let _ = other_tx.send(text);
                }
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    // Cleanup once either side of the pipe closes.
    if role == "host" {
        *state.host_tx.lock().unwrap() = None;
    } else {
        *state.client_tx.lock().unwrap() = None;
        let host_tx = state.host_tx.lock().unwrap().clone();
        if let Some(host_tx) = host_tx {
            let _ = host_tx.send(serde_json::json!({ "type": "peer-left" }).to_string());
        }
    }
}

fn host_display_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "LumaLink Host".to_string())
}
