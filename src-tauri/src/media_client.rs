//! UDP media client — AlaveX LLU2 (token auth, XOR payload, NACK, PLI, RTT).

use std::collections::HashMap;
use std::net::{SocketAddr, ToSocketAddrs, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static MEDIA_STOP: Mutex<Option<std::sync::Arc<AtomicBool>>> = Mutex::new(None);

const MAGIC: &[u8; 4] = b"LLU2";
const TYPE_AUTH: u8 = 0x01;
const TYPE_PING: u8 = 0x02;
const TYPE_NACK: u8 = 0x03;
const TYPE_PLI: u8 = 0x04;
const TYPE_AUTH_OK: u8 = 0x81;
const TYPE_AUTH_FAIL: u8 = 0x82;
const TYPE_PONG: u8 = 0x85;
const TYPE_VIDEO: u8 = 0x10;
const TYPE_AUDIO: u8 = 0x11;
const FLAG_KEY: u8 = 0x01;
const FLAG_ENC: u8 = 0x02;

const VIDEO_HEADER_LEN: usize = 22;
const AUDIO_HEADER_LEN: usize = 18; // magic+type+session+seq+flags+crc
const MAX_FRAME: usize = 8 * 1024 * 1024;
const MAX_PENDING_FRAMES: usize = 16;

#[tauri::command]
pub fn media_connect(
    app: AppHandle,
    host: String,
    port: u16,
    pin: String,
    media_token: Option<String>,
) -> Result<(), String> {
    media_disconnect();
    let stop = std::sync::Arc::new(AtomicBool::new(false));
    *MEDIA_STOP.lock().unwrap() = Some(stop.clone());

    let credential = media_token
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(pin);
    let addr = format!("{host}:{port}");
    thread::Builder::new()
        .name("alavex-media-client".into())
        .spawn(move || {
            if let Err(err) = run_client(app, addr, credential, stop) {
                eprintln!("AlaveX media client: {err}");
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn media_disconnect() {
    if let Some(stop) = MEDIA_STOP.lock().unwrap().take() {
        stop.store(true, Ordering::SeqCst);
    }
}

fn run_client(
    app: AppHandle,
    addr: String,
    credential: String,
    stop: std::sync::Arc<AtomicBool>,
) -> Result<(), String> {
    let server: SocketAddr = addr
        .to_socket_addrs()
        .map_err(|e| format!("미디어 주소 해석 실패: {e}"))?
        .next()
        .ok_or_else(|| "미디어 주소를 찾을 수 없습니다.".to_string())?;

    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("UDP bind 실패: {e}"))?;
    socket
        .connect(server)
        .map_err(|e| format!("UDP connect 실패: {e}"))?;
    socket
        .set_read_timeout(Some(Duration::from_millis(100)))
        .ok();

    let stream_key = derive_stream_key(&credential);

    let mut auth = Vec::with_capacity(5 + credential.len());
    auth.extend_from_slice(MAGIC);
    auth.push(TYPE_AUTH);
    auth.extend_from_slice(credential.as_bytes());
    socket
        .send(&auth)
        .map_err(|e| format!("AUTH 전송 실패: {e}"))?;

    let mut buf = [0u8; 2048];
    let auth_deadline = Instant::now() + Duration::from_secs(5);
    let mut session_id: u32 = 0;
    let mut authed = false;

    while Instant::now() < auth_deadline && !stop.load(Ordering::SeqCst) {
        match socket.recv(&mut buf) {
            Ok(n) if n >= 5 && &buf[..4] == MAGIC => match buf[4] {
                TYPE_AUTH_OK if n >= 15 => {
                    session_id = u32::from_be_bytes(buf[5..9].try_into().unwrap());
                    authed = true;
                    break;
                }
                TYPE_AUTH_FAIL => {
                    return Err("미디어 인증에 실패했습니다.".into());
                }
                _ => {}
            },
            Ok(_) => {}
            Err(err)
                if err.kind() == std::io::ErrorKind::WouldBlock
                    || err.kind() == std::io::ErrorKind::TimedOut =>
            {
                let _ = socket.send(&auth);
            }
            Err(err) => return Err(err.to_string()),
        }
    }
    if !authed {
        return Err("미디어 서버 인증 응답이 없습니다.".into());
    }

    let mut pending: HashMap<u32, PartialFrame> = HashMap::new();
    let mut last_ping = Instant::now();
    let mut last_pli = Instant::now()
        .checked_sub(Duration::from_secs(10))
        .unwrap_or_else(Instant::now);
    let mut last_emitted_frame: u32 = 0;
    let mut waiting_for_key = true;
    let mut rtt_ms: u32 = 0;
    let mut frames_ok: u64 = 0;
    let mut frames_lost: u64 = 0;
    let mut last_stats_emit = Instant::now();

    while !stop.load(Ordering::SeqCst) {
        if last_ping.elapsed() > Duration::from_secs(1) {
            let mut ping = [0u8; 17];
            ping[..4].copy_from_slice(MAGIC);
            ping[4] = TYPE_PING;
            ping[5..9].copy_from_slice(&session_id.to_be_bytes());
            let ts = now_ms();
            ping[9..17].copy_from_slice(&ts.to_be_bytes());
            let _ = socket.send(&ping);
            last_ping = Instant::now();
        }

        let mut need_pli = false;
        let now = Instant::now();
        for (fid, frame) in pending.iter() {
            if frame.started.elapsed() < Duration::from_millis(80) {
                continue;
            }
            for (idx, part) in frame.parts.iter().enumerate() {
                if part.is_none() {
                    send_nack(&socket, session_id, *fid, idx as u16);
                }
            }
            if frame.started.elapsed() > Duration::from_millis(250) {
                need_pli = true;
            }
        }
        pending.retain(|_, f| f.started.elapsed() < Duration::from_millis(500));
        if pending.len() > MAX_PENDING_FRAMES {
            pending.clear();
            need_pli = true;
        }
        if need_pli && last_pli.elapsed() > Duration::from_millis(400) {
            send_pli(&socket, session_id);
            last_pli = now;
            waiting_for_key = true;
            pending.clear();
            frames_lost = frames_lost.saturating_add(1);
        }

        if last_stats_emit.elapsed() > Duration::from_secs(1) {
            let loss_pct = if frames_ok + frames_lost == 0 {
                0.0
            } else {
                (frames_lost as f64) * 100.0 / (frames_ok + frames_lost) as f64
            };
            let _ = app.emit(
                "alavex-media-stats",
                serde_json::json!({
                    "rttMs": rtt_ms,
                    "packetLossPct": (loss_pct * 10.0).round() / 10.0,
                    "framesOk": frames_ok,
                    "framesLost": frames_lost,
                }),
            );
            last_stats_emit = Instant::now();
        }

        match socket.recv(&mut buf) {
            Ok(n) if n >= 5 && &buf[..4] == MAGIC && buf[4] == TYPE_PONG && n >= 13 => {
                let pkt_session = u32::from_be_bytes(buf[5..9].try_into().unwrap());
                if pkt_session == session_id {
                    let sent = u64::from_be_bytes(buf[9..17].try_into().unwrap_or([0; 8]));
                    let delta = now_ms().saturating_sub(sent);
                    rtt_ms = delta.min(u32::MAX as u64) as u32;
                }
            }
            Ok(n) if n >= AUDIO_HEADER_LEN && &buf[..4] == MAGIC && buf[4] == TYPE_AUDIO => {
                let pkt_session = u32::from_be_bytes(buf[5..9].try_into().unwrap());
                if pkt_session != session_id {
                    continue;
                }
                let seq = u32::from_be_bytes(buf[9..13].try_into().unwrap());
                let flags = buf[13];
                let expect_crc = u32::from_be_bytes(buf[14..18].try_into().unwrap());
                let mut payload = buf[AUDIO_HEADER_LEN..n].to_vec();
                if flags & FLAG_ENC != 0 {
                    xor_payload(&mut payload, &stream_key, seq, 0);
                }
                if crc32(&payload) != expect_crc {
                    continue;
                }
                let _ = app.emit("alavex-media-audio", payload);
            }
            Ok(n) if n >= VIDEO_HEADER_LEN && &buf[..4] == MAGIC && buf[4] == TYPE_VIDEO => {
                let pkt_session = u32::from_be_bytes(buf[5..9].try_into().unwrap());
                if pkt_session != session_id {
                    continue;
                }
                let frame_id = u32::from_be_bytes(buf[9..13].try_into().unwrap());
                let frag_idx = u16::from_be_bytes(buf[13..15].try_into().unwrap()) as usize;
                let frag_cnt = u16::from_be_bytes(buf[15..17].try_into().unwrap()) as usize;
                let flags = buf[17];
                let expect_crc = u32::from_be_bytes(buf[18..22].try_into().unwrap());
                let mut payload = buf[VIDEO_HEADER_LEN..n].to_vec();

                if frag_cnt == 0 || frag_idx >= frag_cnt || frag_cnt > 4096 {
                    continue;
                }

                if flags & FLAG_ENC != 0 {
                    xor_payload(&mut payload, &stream_key, frame_id, frag_idx as u16);
                }
                if crc32(&payload) != expect_crc {
                    send_nack(&socket, session_id, frame_id, frag_idx as u16);
                    continue;
                }

                if last_emitted_frame > 0
                    && frame_id > last_emitted_frame.wrapping_add(1)
                    && last_pli.elapsed() > Duration::from_millis(400)
                {
                    let gap = frame_id.saturating_sub(last_emitted_frame + 1);
                    frames_lost = frames_lost.saturating_add(gap as u64);
                    send_pli(&socket, session_id);
                    last_pli = Instant::now();
                    waiting_for_key = true;
                    pending.clear();
                }

                let is_key = (flags & FLAG_KEY) != 0;
                if waiting_for_key && !is_key {
                    continue;
                }

                let entry = pending.entry(frame_id).or_insert_with(|| PartialFrame {
                    frag_cnt,
                    parts: vec![None; frag_cnt],
                    received: 0,
                    flags,
                    started: Instant::now(),
                });
                if entry.frag_cnt != frag_cnt {
                    continue;
                }
                if entry.parts[frag_idx].is_none() {
                    entry.parts[frag_idx] = Some(payload);
                    entry.received += 1;
                    entry.flags |= flags;
                }

                if entry.received != entry.frag_cnt {
                    continue;
                }

                let mut assembled = Vec::new();
                let mut ok = true;
                for part in &entry.parts {
                    match part {
                        Some(p) => assembled.extend_from_slice(p),
                        None => {
                            ok = false;
                            break;
                        }
                    }
                }
                let frame_flags = entry.flags;
                pending.remove(&frame_id);
                if !ok || assembled.is_empty() || assembled.len() > MAX_FRAME {
                    continue;
                }

                let key = (frame_flags & FLAG_KEY) != 0;
                if waiting_for_key && !key {
                    continue;
                }
                if key {
                    waiting_for_key = false;
                }

                last_emitted_frame = frame_id;
                frames_ok = frames_ok.saturating_add(1);
                // Base64 is far more reliable than Vec<u8>→number[] over Tauri IPC.
                let _ = app.emit("alavex-media-frame", base64_encode(&assembled));
            }
            Ok(_) => {}
            Err(err)
                if err.kind() == std::io::ErrorKind::WouldBlock
                    || err.kind() == std::io::ErrorKind::TimedOut => {}
            Err(err) => return Err(err.to_string()),
        }
    }

    Ok(())
}

fn send_nack(socket: &UdpSocket, session_id: u32, frame_id: u32, frag_idx: u16) {
    let mut pkt = [0u8; 15];
    pkt[..4].copy_from_slice(MAGIC);
    pkt[4] = TYPE_NACK;
    pkt[5..9].copy_from_slice(&session_id.to_be_bytes());
    pkt[9..13].copy_from_slice(&frame_id.to_be_bytes());
    pkt[13..15].copy_from_slice(&frag_idx.to_be_bytes());
    let _ = socket.send(&pkt);
}

fn send_pli(socket: &UdpSocket, session_id: u32) {
    let mut pkt = [0u8; 9];
    pkt[..4].copy_from_slice(MAGIC);
    pkt[4] = TYPE_PLI;
    pkt[5..9].copy_from_slice(&session_id.to_be_bytes());
    let _ = socket.send(&pkt);
}

struct PartialFrame {
    frag_cnt: usize,
    parts: Vec<Option<Vec<u8>>>,
    received: usize,
    flags: u8,
    started: Instant,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            let mask = (!(crc & 1)).wrapping_add(1);
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

fn derive_stream_key(token: &str) -> [u8; 16] {
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

fn xor_payload(buf: &mut [u8], key: &[u8; 16], frame_id: u32, frag_idx: u16) {
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

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | (data[i + 2] as u32);
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
        out.push(TABLE[(n & 63) as usize] as char);
        i += 3;
    }
    let rem = data.len() - i;
    if rem == 1 {
        let n = (data[i] as u32) << 16;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8);
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
        out.push('=');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_known_vector() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
    }
}
