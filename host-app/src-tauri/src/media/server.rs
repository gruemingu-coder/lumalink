//! TCP media hub: PIN-auth clients receive length-prefixed Annex-B H.264.

use super::capture::DesktopCapture;
use super::encode::{create_encoder, probe_preferred_backend, EncoderBackend, H264Encoder};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub const MEDIA_PORT: u16 = 58714;

struct StreamConfig {
    width: u32,
    height: u32,
    fps: u32,
    bitrate_mbps: u32,
}

struct Shared {
    pin: Mutex<String>,
    streaming: AtomicBool,
    config: Mutex<StreamConfig>,
    viewers: Mutex<Vec<TcpStream>>,
    frames_sent: AtomicU64,
    backend: Mutex<EncoderBackend>,
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
                config: Mutex::new(StreamConfig {
                    width: 1920,
                    height: 1080,
                    fps: 60,
                    bitrate_mbps: 25,
                }),
                viewers: Mutex::new(Vec::new()),
                frames_sent: AtomicU64::new(0),
                backend: Mutex::new(probe_preferred_backend()),
            }),
        }
    }

    pub fn set_pin(&self, pin: String) {
        *self.inner.pin.lock().unwrap() = pin;
    }

    pub fn preferred_backend(&self) -> EncoderBackend {
        *self.inner.backend.lock().unwrap()
    }

    pub fn start_stream(&self, width: u32, height: u32, fps: u32, bitrate_mbps: u32) {
        {
            let mut cfg = self.inner.config.lock().unwrap();
            cfg.width = width.max(320);
            cfg.height = height.max(240);
            cfg.fps = fps.clamp(15, 500);
            cfg.bitrate_mbps = bitrate_mbps.clamp(1, 300);
        }
        self.inner.streaming.store(true, Ordering::SeqCst);
    }

    pub fn stop_stream(&self) {
        self.inner.streaming.store(false, Ordering::SeqCst);
        if let Ok(mut viewers) = self.inner.viewers.lock() {
            viewers.clear();
        }
    }
}

pub fn run_blocking(hub: Arc<MediaHub>) -> Result<(), String> {
    let listener = TcpListener::bind(("0.0.0.0", MEDIA_PORT))
        .map_err(|e| format!("미디어 포트 {MEDIA_PORT} bind 실패: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("미디어 소켓 nonblocking 실패: {e}"))?;

    let hub_accept = hub.clone();
    thread::Builder::new()
        .name("lumalink-media-accept".into())
        .spawn(move || accept_loop(hub_accept, listener))
        .map_err(|e| e.to_string())?;

    capture_loop(hub)
}

fn accept_loop(hub: Arc<MediaHub>, listener: TcpListener) {
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nodelay(true);
                let expected = hub.inner.pin.lock().unwrap().clone();
                match read_line_timeout(&mut stream, Duration::from_secs(3)) {
                    Ok(line) if line.trim() == expected => {
                        if let Ok(mut viewers) = hub.inner.viewers.lock() {
                            viewers.push(stream);
                        }
                    }
                    _ => {
                        let _ = stream.write_all(b"AUTH_FAIL\n");
                    }
                }
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(10));
            }
            Err(_) => thread::sleep(Duration::from_millis(50)),
        }
    }
}

fn read_line_timeout(stream: &mut TcpStream, timeout: Duration) -> Result<String, String> {
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match stream.read(&mut byte) {
            Ok(0) => break,
            Ok(_) => {
                if byte[0] == b'\n' {
                    break;
                }
                buf.push(byte[0]);
                if buf.len() > 64 {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    stream.set_read_timeout(None).ok();
    String::from_utf8(buf).map_err(|e| e.to_string())
}

fn capture_loop(hub: Arc<MediaHub>) -> Result<(), String> {
    let mut capturer: Option<DesktopCapture> = None;
    let mut encoder: Option<Box<dyn H264Encoder>> = None;
    let mut last_encode_cfg = (0u32, 0u32, 0u32);
    let mut next_deadline = Instant::now();

    loop {
        if !hub.inner.streaming.load(Ordering::SeqCst) {
            capturer = None;
            encoder = None;
            last_encode_cfg = (0, 0, 0);
            thread::sleep(Duration::from_millis(30));
            continue;
        }

        let (target_fps, bitrate) = {
            let c = hub.inner.config.lock().unwrap();
            (c.fps, c.bitrate_mbps)
        };
        let frame_interval = Duration::from_secs_f64(1.0 / f64::from(target_fps.max(1)));

        if capturer.is_none() {
            match DesktopCapture::primary() {
                Ok(c) => capturer = Some(c),
                Err(err) => {
                    eprintln!("LumaLink capture error: {err}");
                    thread::sleep(Duration::from_secs(1));
                    continue;
                }
            }
        }

        let (w, h) = {
            let c = capturer.as_ref().unwrap();
            (c.width as u32, c.height as u32)
        };
        let encode_cfg = (w, h, target_fps);
        if encoder.is_none() || last_encode_cfg != encode_cfg {
            match create_encoder(w, h, target_fps, bitrate) {
                Ok(enc) => {
                    *hub.inner.backend.lock().unwrap() = enc.backend();
                    encoder = Some(enc);
                    last_encode_cfg = encode_cfg;
                    eprintln!(
                        "LumaLink encoder ready: {:?} {}x{} @{}fps {}Mbps",
                        hub.preferred_backend(),
                        w,
                        h,
                        target_fps,
                        bitrate
                    );
                }
                Err(err) => {
                    eprintln!("LumaLink encoder error: {err}");
                    thread::sleep(Duration::from_secs(1));
                    continue;
                }
            }
        }

        let tick = Instant::now();
        let frame = match capturer.as_mut().unwrap().next_frame_bgra() {
            Ok(f) => f,
            Err(err) => {
                eprintln!("LumaLink frame error: {err}");
                capturer = None;
                continue;
            }
        };

        match encoder.as_mut().unwrap().encode_bgra(&frame) {
            Ok(packets) => {
                for packet in packets {
                    broadcast_packet(&hub, &packet.data);
                    hub.inner.frames_sent.fetch_add(1, Ordering::Relaxed);
                }
            }
            Err(err) => {
                eprintln!("LumaLink encode error: {err}");
                encoder = None;
            }
        }

        // Pace to target FPS, but skip sleep if we're already late.
        next_deadline += frame_interval;
        let now = Instant::now();
        if next_deadline > now {
            thread::sleep(next_deadline - now);
        } else if now.duration_since(tick) > frame_interval * 3 {
            // Badly behind — reset pacing so we don't busy-spin forever.
            next_deadline = now;
        }
    }
}

fn broadcast_packet(hub: &MediaHub, data: &[u8]) {
    let mut dead = Vec::new();
    if let Ok(mut viewers) = hub.inner.viewers.lock() {
        for (i, stream) in viewers.iter_mut().enumerate() {
            if write_frame(stream, data).is_err() {
                dead.push(i);
            }
        }
        for i in dead.into_iter().rev() {
            viewers.remove(i);
        }
    }
}

fn write_frame(stream: &mut TcpStream, data: &[u8]) -> std::io::Result<()> {
    let len = (data.len() as u32).to_be_bytes();
    stream.write_all(b"LLH4")?;
    stream.write_all(&len)?;
    stream.write_all(data)?;
    Ok(())
}
