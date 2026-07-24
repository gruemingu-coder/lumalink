//! TCP media client for LumaLink native H.264 streams (host DXGI+NVENC).
//! Reads length-prefixed Annex-B frames and emits them to the webview.

use std::io::Read;
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

static MEDIA_RUNNING: AtomicBool = AtomicBool::new(false);
static MEDIA_STOP: Mutex<Option<std::sync::Arc<AtomicBool>>> = Mutex::new(None);

#[tauri::command]
pub fn media_connect(app: AppHandle, host: String, port: u16, pin: String) -> Result<(), String> {
    media_disconnect();
    let stop = std::sync::Arc::new(AtomicBool::new(false));
    *MEDIA_STOP.lock().unwrap() = Some(stop.clone());
    MEDIA_RUNNING.store(true, Ordering::SeqCst);

    let addr = format!("{host}:{port}");
    thread::Builder::new()
        .name("lumalink-media-client".into())
        .spawn(move || {
            if let Err(err) = run_client(app, addr, pin, stop) {
                eprintln!("LumaLink media client: {err}");
            }
            MEDIA_RUNNING.store(false, Ordering::SeqCst);
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn media_disconnect() {
    if let Some(stop) = MEDIA_STOP.lock().unwrap().take() {
        stop.store(true, Ordering::SeqCst);
    }
    MEDIA_RUNNING.store(false, Ordering::SeqCst);
}

fn run_client(app: AppHandle, addr: String, pin: String, stop: std::sync::Arc<AtomicBool>) -> Result<(), String> {
    use std::net::ToSocketAddrs;
    let socket_addr = addr
        .to_socket_addrs()
        .map_err(|e| format!("미디어 주소 해석 실패: {e}"))?
        .next()
        .ok_or_else(|| "미디어 주소를 찾을 수 없습니다.".to_string())?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("미디어 서버 연결 실패: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(500)))
        .ok();
    stream.set_nodelay(true).ok();

    let auth = format!("{pin}\n");
    use std::io::Write;
    stream
        .write_all(auth.as_bytes())
        .map_err(|e| format!("미디어 인증 실패: {e}"))?;

    let mut header = [0u8; 8];
    while !stop.load(Ordering::SeqCst) {
        match read_exact_interruptible(&mut stream, &mut header, &stop) {
            Ok(true) => {}
            Ok(false) => break,
            Err(err) => return Err(err),
        }
        if &header[0..4] != b"LLH4" {
            return Err("잘못된 미디어 프레임 헤더".into());
        }
        let len = u32::from_be_bytes([header[4], header[5], header[6], header[7]]) as usize;
        if len == 0 || len > 8 * 1024 * 1024 {
            return Err(format!("비정상 프레임 크기: {len}"));
        }
        let mut payload = vec![0u8; len];
        match read_exact_interruptible(&mut stream, &mut payload, &stop) {
            Ok(true) => {}
            Ok(false) => break,
            Err(err) => return Err(err),
        }
        // Emit as Vec<u8> → JS number[]; fine for typical NAL sizes.
        let _ = app.emit("lumalink-media-frame", payload);
    }
    Ok(())
}

/// Returns Ok(true) on success, Ok(false) if stop requested / EOF, Err on hard failure.
fn read_exact_interruptible(
    stream: &mut TcpStream,
    buf: &mut [u8],
    stop: &AtomicBool,
) -> Result<bool, String> {
    let mut filled = 0;
    while filled < buf.len() {
        if stop.load(Ordering::SeqCst) {
            return Ok(false);
        }
        match stream.read(&mut buf[filled..]) {
            Ok(0) => return Ok(false),
            Ok(n) => filled += n,
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock || err.kind() == std::io::ErrorKind::TimedOut => {
                continue;
            }
            Err(err) => return Err(format!("미디어 읽기 실패: {err}")),
        }
    }
    Ok(true)
}
