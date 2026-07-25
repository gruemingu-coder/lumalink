//! Minimal WebSocket signaling relay for LumaLink.
//!
//! This server does NOT speak WebRTC itself — it just authenticates
//! connecting clients with a shared PIN and pipes JSON text frames
//! between exactly one "host" connection (this app's own webview,
//! which does the actual `getDisplayMedia()` + `RTCPeerConnection`
//! work in JS) and any number of "client" connections (remote
//! LumaLink Streaming App / browser tabs), tagging each relayed
//! message with a `clientId` so the host can run one
//! `RTCPeerConnection` per connected client.
//!
//! See `src/services/streaming/signalingProtocol.ts` in the main
//! LumaLink repo for the shared message shapes used on the relay <->
//! CLIENT leg, and this crate's own `signalingProtocol.ts` doc comment
//! for how the relay <-> HOST leg adds `clientId`.

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::sync::mpsc;

use crate::network::primary_mac_address;
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
    // Only meaningful for `role == "client"`; used to tag/route messages
    // to/from this specific session on the host <-> relay leg.
    let client_id: Option<String> = if role == "host" {
        None
    } else {
        Some(state.next_client_id())
    };

    if role == "host" {
        *state.host_tx.lock().unwrap() = Some(tx.clone());
    } else {
        let id = client_id.clone().expect("client role always has a client_id");
        state.clients.lock().unwrap().insert(id.clone(), tx.clone());

        let capture_backend = state
            .media
            .as_ref()
            .map(|m| match m.preferred_backend() {
                crate::media::EncoderBackend::Nvenc => "nvenc",
                crate::media::EncoderBackend::Software => "software",
            })
            .unwrap_or("software");
        let ok = serde_json::json!({
            "type": "auth-ok",
            "hostName": host_display_name(),
            "macAddress": primary_mac_address(),
            "mediaPort": crate::media::MEDIA_PORT,
            "captureBackend": capture_backend,
        });
        let _ = tx.send(ok.to_string());

        let host_tx = state.host_tx.lock().unwrap().clone();
        if let Some(host_tx) = host_tx {
            let _ = host_tx.send(
                serde_json::json!({ "type": "client-connected", "clientId": id }).to_string(),
            );
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
    let relay_client_id = client_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            let Message::Text(text) = msg else { continue };

            if relay_role == "host" {
                // Host -> one specific client, selected by the
                // `clientId` field the host's webview must include.
                let Some(target_id) = extract_client_id(&text) else {
                    continue;
                };
                let target_tx = relay_state.clients.lock().unwrap().get(&target_id).cloned();
                if let Some(target_tx) = target_tx {
                    let _ = target_tx.send(text);
                }
            } else {
                // Client -> host. Tag the message with this client's id
                // so the host knows which session it belongs to.
                let Some(id) = &relay_client_id else { continue };
                let tagged = tag_client_id(&text, id);
                let host_tx = relay_state.host_tx.lock().unwrap().clone();
                if let Some(host_tx) = host_tx {
                    let _ = host_tx.send(tagged);
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
        // The host app going away ends every in-flight session.
        let clients = state.clients.lock().unwrap().clone();
        for (_, client_tx) in clients {
            let _ = client_tx.send(serde_json::json!({ "type": "peer-left" }).to_string());
        }
    } else if let Some(id) = client_id {
        state.clients.lock().unwrap().remove(&id);
        let host_tx = state.host_tx.lock().unwrap().clone();
        if let Some(host_tx) = host_tx {
            let _ = host_tx.send(
                serde_json::json!({ "type": "peer-left", "clientId": id }).to_string(),
            );
        }
    }
}

pub fn host_display_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "LumaLink Host".to_string())
}

/// Reads the `clientId` string field out of a raw JSON text frame sent
/// by the host, without needing to know the full message shape.
fn extract_client_id(text: &str) -> Option<String> {
    let value: Value = serde_json::from_str(text).ok()?;
    value.get("clientId")?.as_str().map(|s| s.to_string())
}

/// Adds/overwrites a `clientId` field on a raw JSON text frame sent by
/// a client, before forwarding it to the host. Falls back to the
/// original text untouched if it isn't a JSON object (shouldn't
/// happen for well-formed clients).
fn tag_client_id(text: &str, client_id: &str) -> String {
    let Ok(mut value) = serde_json::from_str::<Value>(text) else {
        return text.to_string();
    };
    if let Value::Object(map) = &mut value {
        map.insert("clientId".to_string(), Value::String(client_id.to_string()));
    }
    value.to_string()
}
