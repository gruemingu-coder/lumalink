use crate::media::MediaHub;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::UnboundedSender;

pub struct SignalingState {
    pub pin: Mutex<String>,
    pub host_tx: Mutex<Option<UnboundedSender<String>>>,
    pub clients: Mutex<HashMap<String, UnboundedSender<String>>>,
    pub media: Option<Arc<MediaHub>>,
    next_client_id: AtomicU64,
}

impl SignalingState {
    pub fn new(media: Option<Arc<MediaHub>>) -> Self {
        Self {
            pin: Mutex::new(generate_pin()),
            host_tx: Mutex::new(None),
            clients: Mutex::new(HashMap::new()),
            media,
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

pub fn generate_pin() -> String {
    use rand::Rng;
    let n: u32 = rand::thread_rng().gen_range(0..10_000);
    format!("{n:04}")
}
