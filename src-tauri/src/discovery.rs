//! One-shot LAN discovery: listens briefly for UDP broadcast
//! announcements sent by AlaveX Host apps (see
//! `host-app/src-tauri/src/discovery.rs`) and returns whatever it
//! hears. Only available from this desktop app — browsers have no API
//! for receiving raw UDP, so the website keeps using manual IP entry
//! ("IP로 실제 PC 연결").

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::UdpSocket;
use std::time::{Duration, Instant};

/// Kept in sync with `host-app/src-tauri/src/discovery.rs`.
pub const DISCOVERY_PORT: u16 = 58713;

#[derive(Serialize, Deserialize, Clone)]
pub struct DiscoveredHost {
    pub name: String,
    pub address: String,
    #[serde(rename = "signalPort")]
    pub signal_port: u16,
}

#[derive(Deserialize)]
struct Announcement {
    #[serde(rename = "type")]
    kind: String,
    name: String,
    #[serde(rename = "signalPort")]
    signal_port: u16,
}

/// Listens for up to `timeout_ms` milliseconds and returns every
/// distinct AlaveX Host that announced itself during that window
/// (deduplicated by source IP).
pub fn discover(timeout_ms: u64) -> Result<Vec<DiscoveredHost>, String> {
    let socket = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT))
        .map_err(|e| format!("검색 포트({DISCOVERY_PORT})를 열 수 없습니다: {e}"))?;
    socket
        .set_read_timeout(Some(Duration::from_millis(200)))
        .map_err(|e| e.to_string())?;

    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let mut found: HashMap<String, DiscoveredHost> = HashMap::new();
    let mut buf = [0u8; 2048];

    while Instant::now() < deadline {
        match socket.recv_from(&mut buf) {
            Ok((len, src)) => {
                if let Ok(text) = std::str::from_utf8(&buf[..len]) {
                    if let Ok(announcement) = serde_json::from_str::<Announcement>(text) {
                        if announcement.kind == "alavex-host-announce" {
                            let address = src.ip().to_string();
                            found.insert(
                                address.clone(),
                                DiscoveredHost {
                                    name: announcement.name,
                                    address,
                                    signal_port: announcement.signal_port,
                                },
                            );
                        }
                    }
                }
            }
            // Read timeout — expected; just keep polling until the deadline.
            Err(_) => continue,
        }
    }

    Ok(found.into_values().collect())
}
