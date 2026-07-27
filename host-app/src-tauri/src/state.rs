use crate::media::MediaHub;
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

const AUTH_WINDOW: Duration = Duration::from_secs(60);
const AUTH_MAX_FAILS: u32 = 8;
const MEDIA_TOKEN_TTL: Duration = Duration::from_secs(6 * 60 * 60);

pub struct SignalingState {
    pub pin: Mutex<String>,
    pub host_tx: Mutex<Option<UnboundedSender<String>>>,
    pub clients: Mutex<HashMap<String, UnboundedSender<String>>>,
    pub media: Option<Arc<MediaHub>>,
    next_client_id: AtomicU64,
    /// Failed PIN attempts per client IP (sliding window).
    auth_fails: Mutex<HashMap<IpAddr, Vec<Instant>>>,
}

impl SignalingState {
    pub fn new(media: Option<Arc<MediaHub>>) -> Self {
        Self {
            pin: Mutex::new(generate_pin()),
            host_tx: Mutex::new(None),
            clients: Mutex::new(HashMap::new()),
            media,
            next_client_id: AtomicU64::new(1),
            auth_fails: Mutex::new(HashMap::new()),
        }
    }

    pub fn next_client_id(&self) -> String {
        let n = self.next_client_id.fetch_add(1, Ordering::Relaxed);
        format!("c{n}")
    }

    pub fn client_count(&self) -> usize {
        self.clients.lock().unwrap().len()
    }

    pub fn is_auth_rate_limited(&self, ip: IpAddr) -> bool {
        let mut map = self.auth_fails.lock().unwrap();
        let now = Instant::now();
        let entry = map.entry(ip).or_default();
        entry.retain(|t| now.duration_since(*t) < AUTH_WINDOW);
        entry.len() as u32 >= AUTH_MAX_FAILS
    }

    pub fn record_auth_fail(&self, ip: IpAddr) {
        let mut map = self.auth_fails.lock().unwrap();
        map.entry(ip).or_default().push(Instant::now());
    }

    pub fn clear_auth_fails(&self, ip: IpAddr) {
        self.auth_fails.lock().unwrap().remove(&ip);
    }

    pub fn issue_media_token(&self) -> Option<String> {
        let media = self.media.as_ref()?;
        Some(media.issue_token(MEDIA_TOKEN_TTL))
    }
}

pub fn generate_pin() -> String {
    use rand::Rng;
    let n: u32 = rand::thread_rng().gen_range(0..10_000);
    format!("{n:04}")
}

/// Constant-time-ish compare for equal-length PINs.
pub fn pin_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}
