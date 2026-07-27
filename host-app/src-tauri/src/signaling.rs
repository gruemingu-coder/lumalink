//! WebSocket signaling relay for LumaLink.
//!
//! Security notes (v0.5+):
//! - PIN is NOT accepted in the query string (avoid leaking via logs/proxies).
//! - Clients must send `{ "type": "auth", "pin": "..." }` after connect.
//! - Failed PIN attempts are rate-limited per source IP.
//! - Successful auth issues a short-lived `mediaToken` for UDP LLU2 (PIN not reused on media).

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{ConnectInfo, Query, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::Duration};
use tokio::sync::mpsc;

use crate::network::primary_mac_address;
use crate::state::{self, SignalingState};

pub const SIGNALING_PORT: u16 = 58712;

pub async fn run(state: Arc<SignalingState>) {
    let app = Router::new()
        .route("/signal", get(ws_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], SIGNALING_PORT));
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            if let Err(err) = axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            {
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
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<SignalingState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, params, state, addr))
}

async fn handle_socket(
    socket: WebSocket,
    params: HashMap<String, String>,
    state: Arc<SignalingState>,
    peer: SocketAddr,
) {
    let role = params.get("role").cloned().unwrap_or_default();
    let (mut sender, mut receiver) = socket.split();

    if role != "host" && role != "client" {
        return;
    }

    // Reject legacy `?pin=` — force body auth for clients.
    if role == "client" && params.contains_key("pin") {
        let fail = serde_json::json!({
            "type": "auth-fail",
            "reason": "보안상 PIN은 URL에 넣을 수 없습니다. 연결 후 auth 메시지로 보내주세요."
        });
        let _ = sender.send(Message::Text(fail.to_string())).await;
        return;
    }

    if role == "host" {
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        *state.host_tx.lock().unwrap() = Some(tx.clone());

        let mut send_task = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if sender.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
        });

        let relay_state = state.clone();
        let mut recv_task = tokio::spawn(async move {
            while let Some(Ok(msg)) = receiver.next().await {
                let Message::Text(text) = msg else { continue };
                let Some(target_id) = extract_client_id(&text) else {
                    continue;
                };
                let target_tx = relay_state.clients.lock().unwrap().get(&target_id).cloned();
                if let Some(target_tx) = target_tx {
                    let _ = target_tx.send(text);
                }
            }
        });

        tokio::select! {
            _ = &mut send_task => recv_task.abort(),
            _ = &mut recv_task => send_task.abort(),
        }

        *state.host_tx.lock().unwrap() = None;
        let clients = state.clients.lock().unwrap().clone();
        for (_, client_tx) in clients {
            let _ = client_tx.send(serde_json::json!({ "type": "peer-left" }).to_string());
        }
        return;
    }

    let Ok(id) = authenticate_client(&state, &mut sender, &mut receiver, peer.ip()).await else {
        return;
    };
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    state.clients.lock().unwrap().insert(id.clone(), tx.clone());

    let host_tx = state.host_tx.lock().unwrap().clone();
    if let Some(host_tx) = host_tx {
        let _ = host_tx.send(
            serde_json::json!({ "type": "client-connected", "clientId": id }).to_string(),
        );
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    let relay_state = state.clone();
    let relay_client_id = id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            let Message::Text(text) = msg else { continue };
            let tagged = tag_client_id(&text, &relay_client_id);
            let host_tx = relay_state.host_tx.lock().unwrap().clone();
            if let Some(host_tx) = host_tx {
                let _ = host_tx.send(tagged);
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    state.clients.lock().unwrap().remove(&id);
    let host_tx = state.host_tx.lock().unwrap().clone();
    if let Some(host_tx) = host_tx {
        let _ = host_tx.send(serde_json::json!({ "type": "peer-left", "clientId": id }).to_string());
    }
}

async fn authenticate_client(
    state: &SignalingState,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    receiver: &mut futures_util::stream::SplitStream<WebSocket>,
    ip: std::net::IpAddr,
) -> Result<String, ()> {
    if state.is_auth_rate_limited(ip) {
        let fail = serde_json::json!({
            "type": "auth-fail",
            "reason": "인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."
        });
        let _ = sender.send(Message::Text(fail.to_string())).await;
        return Err(());
    }

    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let left = deadline.saturating_duration_since(tokio::time::Instant::now());
        if left.is_zero() {
            let fail = serde_json::json!({
                "type": "auth-fail",
                "reason": "인증 시간이 초과되었습니다."
            });
            let _ = sender.send(Message::Text(fail.to_string())).await;
            return Err(());
        }

        let next = tokio::time::timeout(left, receiver.next()).await;
        let Some(Ok(msg)) = next.ok().flatten() else {
            return Err(());
        };
        let Message::Text(text) = msg else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if value.get("type").and_then(|t| t.as_str()) != Some("auth") {
            continue;
        }
        let pin = value
            .get("pin")
            .and_then(|p| p.as_str())
            .unwrap_or("")
            .trim();
        let expected = state.pin.lock().unwrap().clone();
        if !state::pin_eq(pin, &expected) {
            state.record_auth_fail(ip);
            let fail = serde_json::json!({
                "type": "auth-fail",
                "reason": "PIN이 올바르지 않습니다."
            });
            let _ = sender.send(Message::Text(fail.to_string())).await;
            return Err(());
        }

        state.clear_auth_fails(ip);
        let id = state.next_client_id();
        let media_token = state.issue_media_token();
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
            "mediaToken": media_token,
            "protocol": "LLU2",
        });
        let _ = sender.send(Message::Text(ok.to_string())).await;
        return Ok(id);
    }
}

pub fn host_display_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "LumaLink Host".to_string())
}

fn extract_client_id(text: &str) -> Option<String> {
    let value: Value = serde_json::from_str(text).ok()?;
    value.get("clientId")?.as_str().map(|s| s.to_string())
}

fn tag_client_id(text: &str, client_id: &str) -> String {
    let Ok(mut value) = serde_json::from_str::<Value>(text) else {
        return text.to_string();
    };
    if let Value::Object(map) = &mut value {
        map.insert("clientId".to_string(), Value::String(client_id.to_string()));
    }
    value.to_string()
}
