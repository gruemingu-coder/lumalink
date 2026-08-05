//! UDP media hub — AlaveX LLU2 protocol (not Sunshine/Moonlight).
//!
//! Client → Host:
//! - `LLU2` + AUTH(0x01) + mediaToken (hex) — preferred; legacy PIN still accepted
//! - `LLU2` + PING(0x02) + session_id + client_ts_ms(u64)
//! - `LLU2` + NACK(0x03) + session_id + frame_id + frag_idx
//! - `LLU2` + PLI(0x04) + session_id
//!
//! Host → Client:
//! - `LLU2` + AUTH_OK(0x81) + session_id + w + h + fps
//! - `LLU2` + AUTH_FAIL(0x82)
//! - `LLU2` + PONG(0x85) + session_id + client_ts_ms (echo)
//! - `LLU2` + VIDEO(0x10) + … + flags(+ENC) + crc32(plain) + payload(xor)

use super::audio::{AudioCapture, TYPE_AUDIO};
use super::capture::DesktopCapture;
use super::encode::{create_encoder, probe_preferred_backend, EncoderBackend, H264Encoder};
use rand::RngCore;
use std::collections::HashMap;
use std::net::{SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub const MEDIA_PORT: u16 = 58714;

const MAGIC: &[u8; 4] = b"LLU2";
const TYPE_AUTH: u8 = 0x01;
const TYPE_PING: u8 = 0x02;
const TYPE_NACK: u8 = 0x03;
const TYPE_PLI: u8 = 0x04;
const TYPE_AUTH_OK: u8 = 0x81;
const TYPE_AUTH_FAIL: u8 = 0x82;
const TYPE_PONG: u8 = 0x85;
const TYPE_VIDEO: u8 = 0x10;

const FLAG_KEY: u8 = 0x01;
const FLAG_ENC: u8 = 0x02;
/// Bytes of Annex-B payload per UDP datagram (under typical LAN MTU).
const MAX_FRAG_PAYLOAD: usize = 1100;
const VIEWER_STALE: Duration = Duration::from_secs(8);
const VIDEO_HEADER_LEN: usize = 4 + 1 + 4 + 4 + 2 + 2 + 1 + 4; // 22

struct StreamConfig {
    width: u32,
    height: u32,
    fps: u32,
    bitrate_mbps: u32,
    host_audio: bool,
}

struct Viewer {
    session_id: u32,
    last_seen: Instant,
    stream_key: [u8; 16],
}

struct CachedFrame {
    session_id: u32,
    frame_id: u32,
    flags: u8,
    frags: Vec<Vec<u8>>,
    crc32s: Vec<u32>,
}

struct Shared {
    pin: Mutex<String>,
    streaming: AtomicBool,
    force_idr: AtomicBool,
    config: Mutex<StreamConfig>,
    viewers: Mutex<HashMap<SocketAddr, Viewer>>,
    /// Short-lived tokens issued after WebSocket PIN auth.
    tokens: Mutex<HashMap<String, Instant>>,
    frames_sent: AtomicU64,
    audio_sent: AtomicU64,
    frame_id: AtomicU32,
    audio_seq: AtomicU32,
    next_session: AtomicU32,
    backend: Mutex<EncoderBackend>,
    socket: Mutex<Option<UdpSocket>>,
    last_frame: Mutex<Option<CachedFrame>>,
    capture_size: Mutex<(u32, u32)>,
    /// Single-viewer lock: when true, reject additional UDP viewers.
    single_viewer: AtomicBool,
}

pub struct MediaHub {
    inner: Arc<Shared>,
}

impl MediaHub {
    pub fn new(pin: String) -> Self {
        Self {
            inner: Arc::new(Shared {
                pin: Mutex::new(pin),
                streaming: AtomicBool::new(false),
                force_idr: AtomicBool::new(false),
                config: Mutex::new(StreamConfig {
                    width: 1920,
                    height: 1080,
                    fps: 60,
                    bitrate_mbps: 25,
                    host_audio: true,
                }),
                viewers: Mutex::new(HashMap::new()),
                tokens: Mutex::new(HashMap::new()),
                frames_sent: AtomicU64::new(0),
                audio_sent: AtomicU64::new(0),
                frame_id: AtomicU32::new(1),
                audio_seq: AtomicU32::new(1),
                next_session: AtomicU32::new(1),
                backend: Mutex::new(probe_preferred_backend()),
                socket: Mutex::new(None),
                last_frame: Mutex::new(None),
                capture_size: Mutex::new((1920, 1080)),
                single_viewer: AtomicBool::new(true),
            }),
        }
    }

    pub fn set_pin(&self, pin: String) {
        *self.inner.pin.lock().unwrap() = pin;
        // PIN rotate invalidates outstanding media tokens.
        self.inner.tokens.lock().unwrap().clear();
    }

    pub fn issue_token(&self, ttl: Duration) -> String {
        let mut bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut bytes);
        let token = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
        let mut map = self.inner.tokens.lock().unwrap();
        let now = Instant::now();
        map.retain(|_, exp| *exp > now);
        map.insert(token.clone(), now + ttl);
        token
    }

    fn check_token(&self, token: &str) -> bool {
        let mut map = self.inner.tokens.lock().unwrap();
        let now = Instant::now();
        map.retain(|_, exp| *exp > now);
        map.contains_key(token)
    }


    pub fn preferred_backend(&self) -> EncoderBackend {
        *self.inner.backend.lock().unwrap()
    }

    pub fn start_stream(
        &self,
        width: u32,
        height: u32,
        fps: u32,
        bitrate_mbps: u32,
        host_audio: bool,
    ) {
        {
            let mut cfg = self.inner.config.lock().unwrap();
            cfg.width = width.max(320);
            cfg.height = height.max(240);
            cfg.fps = fps.clamp(15, 500);
            cfg.bitrate_mbps = bitrate_mbps.clamp(1, 300);
            cfg.host_audio = host_audio;
        }
        self.inner.force_idr.store(true, Ordering::SeqCst);
        self.inner.streaming.store(true, Ordering::SeqCst);
    }

    pub fn stop_stream(&self) {
        self.inner.streaming.store(false, Ordering::SeqCst);
        if let Ok(mut viewers) = self.inner.viewers.lock() {
            viewers.clear();
        }
        *self.inner.last_frame.lock().unwrap() = None;
    }

    pub fn snapshot_stats(&self) -> MediaStats {
        MediaStats {
            streaming: self.inner.streaming.load(Ordering::Relaxed),
            viewers: self.inner.viewers.lock().unwrap().len(),
            frames_sent: self.inner.frames_sent.load(Ordering::Relaxed),
            audio_sent: self.inner.audio_sent.load(Ordering::Relaxed),
            backend: match self.preferred_backend() {
                EncoderBackend::Nvenc => "nvenc".into(),
                EncoderBackend::Software => "software".into(),
            },
            host_audio: self.inner.config.lock().unwrap().host_audio,
        }
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaStats {
    pub streaming: bool,
    pub viewers: usize,
    pub frames_sent: u64,
    pub audio_sent: u64,
    pub backend: String,
    pub host_audio: bool,
}

pub fn run_blocking(hub: Arc<MediaHub>) -> Result<(), String> {
    let socket = UdpSocket::bind(("0.0.0.0", MEDIA_PORT))
        .map_err(|e| format!("미디어 UDP 포트 {MEDIA_PORT} bind 실패: {e}"))?;
    socket
        .set_read_timeout(Some(Duration::from_millis(20)))
        .map_err(|e| e.to_string())?;

    let recv_sock = socket
        .try_clone()
        .map_err(|e| format!("UDP clone 실패: {e}"))?;
    *hub.inner.socket.lock().unwrap() = Some(socket);

    let hub_recv = hub.clone();
    thread::Builder::new()
        .name("alavex-media-udp".into())
        .spawn(move || recv_loop(hub_recv, recv_sock))
        .map_err(|e| e.to_string())?;

    capture_loop(hub)
}

fn recv_loop(hub: Arc<MediaHub>, socket: UdpSocket) {
    let mut buf = [0u8; 2048];
    loop {
        match socket.recv_from(&mut buf) {
            Ok((n, addr)) if n >= 5 && &buf[..4] == MAGIC => {
                match buf[4] {
                    TYPE_AUTH => handle_auth(&hub, &socket, addr, &buf[5..n]),
                    TYPE_PING => handle_ping(&hub, &socket, addr, &buf[5..n]),
                    TYPE_NACK => handle_nack(&hub, &socket, addr, &buf[5..n]),
                    TYPE_PLI => handle_pli(&hub, addr, &buf[5..n]),
                    _ => {}
                }
            }
            Ok(_) => {}
            Err(err)
                if err.kind() == std::io::ErrorKind::WouldBlock
                    || err.kind() == std::io::ErrorKind::TimedOut =>
            {
                prune_viewers(&hub);
            }
            Err(_) => thread::sleep(Duration::from_millis(20)),
        }
    }
}

fn handle_auth(hub: &MediaHub, socket: &UdpSocket, addr: SocketAddr, rest: &[u8]) {
    let credential = String::from_utf8_lossy(rest).trim().to_string();
    let pin_ok = {
        let expected = hub.inner.pin.lock().unwrap().clone();
        credential == expected
    };
    let token_ok = !pin_ok && hub.check_token(&credential);
    if !pin_ok && !token_ok {
        let _ = socket.send_to(&[MAGIC[0], MAGIC[1], MAGIC[2], MAGIC[3], TYPE_AUTH_FAIL], addr);
        return;
    }

    if hub.inner.single_viewer.load(Ordering::Relaxed) {
        let viewers = hub.inner.viewers.lock().unwrap();
        if !viewers.is_empty() && !viewers.contains_key(&addr) {
            let _ = socket.send_to(&[MAGIC[0], MAGIC[1], MAGIC[2], MAGIC[3], TYPE_AUTH_FAIL], addr);
            return;
        }
    }

    let session_id = hub.inner.next_session.fetch_add(1, Ordering::Relaxed);
    let stream_key = derive_stream_key(&credential);
    if let Ok(mut viewers) = hub.inner.viewers.lock() {
        viewers.insert(
            addr,
            Viewer {
                session_id,
                last_seen: Instant::now(),
                stream_key,
            },
        );
    }

    hub.inner.force_idr.store(true, Ordering::SeqCst);

    let (w, h) = *hub.inner.capture_size.lock().unwrap();
    let fps = hub.inner.config.lock().unwrap().fps.min(u16::MAX as u32) as u16;
    let mut pkt = Vec::with_capacity(15);
    pkt.extend_from_slice(MAGIC);
    pkt.push(TYPE_AUTH_OK);
    pkt.extend_from_slice(&session_id.to_be_bytes());
    pkt.extend_from_slice(&(w.min(u16::MAX as u32) as u16).to_be_bytes());
    pkt.extend_from_slice(&(h.min(u16::MAX as u32) as u16).to_be_bytes());
    pkt.extend_from_slice(&fps.to_be_bytes());
    let _ = socket.send_to(&pkt, addr);
}

fn handle_ping(hub: &MediaHub, socket: &UdpSocket, addr: SocketAddr, rest: &[u8]) {
    if rest.len() < 4 {
        return;
    }
    let session_id = u32::from_be_bytes(rest[0..4].try_into().unwrap());
    let ok = {
        let mut viewers = hub.inner.viewers.lock().unwrap();
        if let Some(v) = viewers.get_mut(&addr) {
            if v.session_id == session_id {
                v.last_seen = Instant::now();
                true
            } else {
                false
            }
        } else {
            false
        }
    };
    if !ok {
        return;
    }
    // Echo client timestamp for RTT (optional 8 bytes after session_id).
    let mut pong = Vec::with_capacity(13);
    pong.extend_from_slice(MAGIC);
    pong.push(TYPE_PONG);
    pong.extend_from_slice(&session_id.to_be_bytes());
    if rest.len() >= 12 {
        pong.extend_from_slice(&rest[4..12]);
    }
    let _ = socket.send_to(&pong, addr);
}

fn handle_nack(hub: &MediaHub, socket: &UdpSocket, addr: SocketAddr, rest: &[u8]) {
    if rest.len() < 10 {
        return;
    }
    let session_id = u32::from_be_bytes(rest[0..4].try_into().unwrap());
    let frame_id = u32::from_be_bytes(rest[4..8].try_into().unwrap());
    let frag_idx = u16::from_be_bytes(rest[8..10].try_into().unwrap()) as usize;

    {
        let viewers = hub.inner.viewers.lock().unwrap();
        match viewers.get(&addr) {
            Some(v) if v.session_id == session_id => {}
            _ => return,
        }
    }

    let cache = hub.inner.last_frame.lock().unwrap();
    let Some(cached) = cache.as_ref() else {
        return;
    };
    if cached.session_id != session_id || cached.frame_id != frame_id {
        return;
    }
    if frag_idx >= cached.frags.len() {
        return;
    }

    let stream_key = {
        let viewers = hub.inner.viewers.lock().unwrap();
        viewers.get(&addr).map(|v| v.stream_key)
    };
    let Some(stream_key) = stream_key else {
        return;
    };
    let mut wire = cached.frags[frag_idx].clone();
    if cached.flags & FLAG_ENC != 0 {
        xor_payload(&mut wire, &stream_key, frame_id, frag_idx as u16);
    }
    let pkt = build_video_packet(
        session_id,
        frame_id,
        frag_idx as u16,
        cached.frags.len() as u16,
        cached.flags,
        cached.crc32s[frag_idx],
        &wire,
    );
    let _ = socket.send_to(&pkt, addr);
}

fn handle_pli(hub: &MediaHub, addr: SocketAddr, rest: &[u8]) {
    if rest.len() < 4 {
        return;
    }
    let session_id = u32::from_be_bytes(rest[0..4].try_into().unwrap());
    let ok = {
        let viewers = hub.inner.viewers.lock().unwrap();
        viewers
            .get(&addr)
            .is_some_and(|v| v.session_id == session_id)
    };
    if ok {
        hub.inner.force_idr.store(true, Ordering::SeqCst);
    }
}

fn prune_viewers(hub: &MediaHub) {
    if let Ok(mut viewers) = hub.inner.viewers.lock() {
        viewers.retain(|_, v| v.last_seen.elapsed() < VIEWER_STALE);
    }
}

fn capture_loop(hub: Arc<MediaHub>) -> Result<(), String> {
    let mut capturer: Option<DesktopCapture> = None;
    let mut encoder: Option<Box<dyn H264Encoder>> = None;
    let mut audio: Option<AudioCapture> = None;
    let mut last_encode_cfg = (0u32, 0u32, 0u32);
    let mut next_deadline = Instant::now();
    let mut want_audio = true;

    // Reuse one send socket for the whole loop.
    let send_sock = {
        let guard = hub.inner.socket.lock().unwrap();
        guard
            .as_ref()
            .ok_or_else(|| "UDP socket missing".to_string())?
            .try_clone()
            .map_err(|e| e.to_string())?
    };

    loop {
        if !hub.inner.streaming.load(Ordering::SeqCst) {
            capturer = None;
            encoder = None;
            audio = None;
            last_encode_cfg = (0, 0, 0);
            thread::sleep(Duration::from_millis(30));
            continue;
        }

        if hub.inner.force_idr.swap(false, Ordering::SeqCst) {
            // Recreate encoder so the next AU includes SPS/PPS + IDR.
            encoder = None;
        }

        let (target_fps, bitrate, host_audio) = {
            let c = hub.inner.config.lock().unwrap();
            (c.fps, c.bitrate_mbps, c.host_audio)
        };
        if host_audio != want_audio {
            want_audio = host_audio;
            audio = None;
        }
        if want_audio && audio.is_none() {
            audio = AudioCapture::try_start();
        }
        if !want_audio {
            audio = None;
        }
        let frame_interval = Duration::from_secs_f64(1.0 / f64::from(target_fps.max(1)));

        if capturer.is_none() {
            match DesktopCapture::primary() {
                Ok(c) => capturer = Some(c),
                Err(err) => {
                    eprintln!("AlaveX capture error: {err}");
                    thread::sleep(Duration::from_secs(1));
                    continue;
                }
            }
        }

        let (w, h) = {
            let c = capturer.as_ref().unwrap();
            (c.width as u32, c.height as u32)
        };
        *hub.inner.capture_size.lock().unwrap() = (w, h);

        let encode_cfg = (w, h, target_fps);
        if encoder.is_none() || last_encode_cfg != encode_cfg {
            match create_encoder(w, h, target_fps, bitrate) {
                Ok(enc) => {
                    *hub.inner.backend.lock().unwrap() = enc.backend();
                    encoder = Some(enc);
                    last_encode_cfg = encode_cfg;
                    eprintln!(
                        "AlaveX encoder ready: {:?} {}x{} @{}fps {}Mbps (LLU2/UDP)",
                        hub.preferred_backend(),
                        w,
                        h,
                        target_fps,
                        bitrate
                    );
                }
                Err(err) => {
                    eprintln!("AlaveX encoder error: {err}");
                    thread::sleep(Duration::from_secs(1));
                    continue;
                }
            }
        }

        let tick = Instant::now();
        let frame = match capturer.as_mut().unwrap().next_frame_bgra() {
            Ok(f) => f,
            Err(err) => {
                eprintln!("AlaveX frame error: {err}");
                capturer = None;
                continue;
            }
        };

        match encoder.as_mut().unwrap().encode_bgra(&frame) {
            Ok(packets) => {
                for packet in packets {
                    let is_key = looks_like_key_frame(&packet.data);
                    broadcast_frame(&hub, &send_sock, &packet.data, is_key);
                    hub.inner.frames_sent.fetch_add(1, Ordering::Relaxed);
                }
            }
            Err(err) => {
                eprintln!("AlaveX encode error: {err}");
                encoder = None;
            }
        }

        if let Some(a) = audio.as_mut() {
            for pkt in a.drain() {
                broadcast_audio(&hub, &send_sock, &pkt.data);
                hub.inner.audio_sent.fetch_add(1, Ordering::Relaxed);
            }
        }

        next_deadline += frame_interval;
        let now = Instant::now();
        if next_deadline > now {
            thread::sleep(next_deadline - now);
        } else if now.duration_since(tick) > frame_interval * 2 {
            // Catch up after a slow frame instead of compounding delay.
            next_deadline = now + frame_interval;
        }
    }
}

fn broadcast_frame(hub: &MediaHub, socket: &UdpSocket, data: &[u8], is_key: bool) {
    if data.is_empty() {
        return;
    }

    let viewers: Vec<(SocketAddr, u32, [u8; 16])> = {
        let map = hub.inner.viewers.lock().unwrap();
        map.iter()
            .map(|(a, v)| (*a, v.session_id, v.stream_key))
            .collect()
    };
    if viewers.is_empty() {
        return;
    }

    let frame_id = hub.inner.frame_id.fetch_add(1, Ordering::Relaxed);
    let base_flags: u8 = if is_key { FLAG_KEY } else { 0 };
    let chunks: Vec<&[u8]> = data.chunks(MAX_FRAG_PAYLOAD).collect();
    let frag_count = chunks.len().min(u16::MAX as usize) as u16;
    if frag_count == 0 {
        return;
    }

    let mut plain_frags: Vec<Vec<u8>> = Vec::with_capacity(chunks.len());
    let mut crc32s: Vec<u32> = Vec::with_capacity(chunks.len());
    for chunk in &chunks {
        crc32s.push(crc32(chunk));
        plain_frags.push(chunk.to_vec());
    }

    if let Some((_, sid, _)) = viewers.first() {
        *hub.inner.last_frame.lock().unwrap() = Some(CachedFrame {
            session_id: *sid,
            frame_id,
            flags: base_flags | FLAG_ENC,
            frags: plain_frags.clone(),
            crc32s: crc32s.clone(),
        });
    }

    for (addr, session_id, stream_key) in &viewers {
        if let Ok(mut cache) = hub.inner.last_frame.lock() {
            if let Some(c) = cache.as_mut() {
                c.session_id = *session_id;
            }
        }
        for (idx, chunk) in plain_frags.iter().enumerate() {
            let mut wire = chunk.clone();
            xor_payload(&mut wire, stream_key, frame_id, idx as u16);
            let pkt = build_video_packet(
                *session_id,
                frame_id,
                idx as u16,
                frag_count,
                base_flags | FLAG_ENC,
                crc32s[idx],
                &wire,
            );
            let _ = socket.send_to(&pkt, addr);
        }
    }
}

fn broadcast_audio(hub: &MediaHub, socket: &UdpSocket, data: &[u8]) {
    if data.is_empty() {
        return;
    }
    let viewers: Vec<(SocketAddr, u32, [u8; 16])> = {
        let map = hub.inner.viewers.lock().unwrap();
        map.iter()
            .map(|(a, v)| (*a, v.session_id, v.stream_key))
            .collect()
    };
    if viewers.is_empty() {
        return;
    }
    let seq = hub.inner.audio_seq.fetch_add(1, Ordering::Relaxed);
    let crc = crc32(data);
    for (addr, session_id, stream_key) in &viewers {
        let mut wire = data.to_vec();
        xor_payload(&mut wire, stream_key, seq, 0);
        let mut pkt = Vec::with_capacity(18 + wire.len());
        pkt.extend_from_slice(MAGIC);
        pkt.push(TYPE_AUDIO);
        pkt.extend_from_slice(&session_id.to_be_bytes());
        pkt.extend_from_slice(&seq.to_be_bytes());
        pkt.push(FLAG_ENC);
        pkt.extend_from_slice(&crc.to_be_bytes());
        pkt.extend_from_slice(&wire);
        let _ = socket.send_to(&pkt, addr);
    }
}

fn build_video_packet(
    session_id: u32,
    frame_id: u32,
    frag_idx: u16,
    frag_cnt: u16,
    flags: u8,
    crc: u32,
    payload: &[u8],
) -> Vec<u8> {
    let mut pkt = Vec::with_capacity(VIDEO_HEADER_LEN + payload.len());
    pkt.extend_from_slice(MAGIC);
    pkt.push(TYPE_VIDEO);
    pkt.extend_from_slice(&session_id.to_be_bytes());
    pkt.extend_from_slice(&frame_id.to_be_bytes());
    pkt.extend_from_slice(&frag_idx.to_be_bytes());
    pkt.extend_from_slice(&frag_cnt.to_be_bytes());
    pkt.push(flags);
    pkt.extend_from_slice(&crc.to_be_bytes());
    pkt.extend_from_slice(payload);
    pkt
}

fn looks_like_key_frame(data: &[u8]) -> bool {
    let mut i = 0;
    while i + 4 < data.len() {
        let start = if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 0 && data[i + 3] == 1 {
            i + 4
        } else if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            i + 3
        } else {
            i += 1;
            continue;
        };
        if start < data.len() {
            let nal = data[start] & 0x1f;
            if nal == 5 || nal == 7 {
                return true;
            }
            i = start;
        } else {
            break;
        }
    }
    false
}

/// CRC-32/ISO-HDLC (poly 0xEDB88320), used to drop corrupted UDP payloads.
pub fn crc32(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            let mask = (!(crc & 1)).wrapping_add(1); // 0 or 0xFFFF_FFFF
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

pub fn derive_stream_key(token: &str) -> [u8; 16] {
    let mut out = [0u8; 16];
    let b = token.as_bytes();
    for (i, slot) in out.iter_mut().enumerate() {
        let mut x = 0xA5u8.wrapping_add(i as u8);
        for (j, &tb) in b.iter().enumerate() {
            x ^= tb.wrapping_add((i.wrapping_add(j)) as u8).wrapping_mul(31);
            x = x.rotate_left(3);
        }
        *slot = x;
    }
    out
}

pub fn xor_payload(buf: &mut [u8], key: &[u8; 16], frame_id: u32, frag_idx: u16) {
    let mut ks = *key;
    for (i, k) in ks.iter_mut().enumerate() {
        *k ^= ((frame_id >> ((i % 4) * 8)) as u8)
            .wrapping_add(frag_idx as u8)
            .wrapping_add(i as u8);
    }
    for (i, b) in buf.iter_mut().enumerate() {
        *b ^= ks[i % 16];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_known_vector() {
        // "123456789" → 0xCBF43926
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
    }

    #[test]
    fn xor_roundtrip() {
        let key = derive_stream_key("deadbeefcafe00112233445566778899");
        let mut buf = b"annex-b-payload".to_vec();
        let orig = buf.clone();
        xor_payload(&mut buf, &key, 42, 3);
        assert_ne!(buf, orig);
        xor_payload(&mut buf, &key, 42, 3);
        assert_eq!(buf, orig);
    }
}
