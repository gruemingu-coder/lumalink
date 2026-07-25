//! TCP media client for LumaLink native H.264 streams (host DXGI+NVENC).
//! Reads length-prefixed Annex-B frames and emits them to the webview.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

static MEDIA_STOP: Mutex<Option<std::sync::Arc<AtomicBool>>> = Mutex::new(None);

#[tauri::command]
pub fn media_connect(app: AppHandle, host: String, port: u16, pin: String) -> Result<(), String> {
    media_disconnect();
    let stop = std::sync::Arc::new(AtomicBool::new(false));
    *MEDIA_STOP.lock().unwrap() = Some(stop.clone());

    let addr = format!("{host}:{port}");
    thread::Builder::new()
        .name("lumalink-media-client".into())
        .spawn(move || {
            if let Err(err) = run_client(app, addr, pin, stop) {
                eprintln!("LumaLink media client: {err}");
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
    pin: String,
    stop: std::sync::Arc<AtomicBool>,
) -> Result<(), String> {
    let socket_addr = addr
        .to_socket_addrs()
        .map_err(|e| format!("미디어 주소 해석 실패: {e}"))?
        .next()
        .ok_or_else(|| "미디어 주소를 찾을 수 없습니다.".to_string())?;

    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("미디어 서버 연결 실패: {e}"))?;
    let _ = stream.set_nodelay(true);
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .ok();

    stream
        .write_all(format!("{pin}\n").as_bytes())
        .map_err(|e| format!("PIN 전송 실패: {e}"))?;

    let mut magic = [0u8; 4];
    let mut len_buf = [0u8; 4];

    while !stop.load(Ordering::SeqCst) {
        if !read_exact_retry(&mut stream, &mut magic, &stop)? {
            break;
        }
        if &magic != b"LLH4" {
            return Err("미디어 프로토콜 매직이 올바르지 않습니다.".into());
        }

        if !read_exact_retry(&mut stream, &mut len_buf, &stop)? {
            break;
        }
        let len = u32::from_be_bytes(len_buf) as usize;
        if len == 0 || len > 8 * 1024 * 1024 {
            return Err("미디어 프레임 크기가 올바르지 않습니다.".into());
        }

        let mut payload = vec![0u8; len];
        if !read_exact_retry(&mut stream, &mut payload, &stop)? {
            break;
        }

        let b64 = base64_encode(&payload);
        let _ = app.emit("lumalink-media-frame", b64);
    }

    Ok(())
}

/// Returns Ok(false) when stop is requested; Ok(true) when the buffer is filled.
fn read_exact_retry(
    stream: &mut TcpStream,
    buf: &mut [u8],
    stop: &AtomicBool,
) -> Result<bool, String> {
    let mut read = 0;
    while read < buf.len() {
        if stop.load(Ordering::SeqCst) {
            return Ok(false);
        }
        match stream.read(&mut buf[read..]) {
            Ok(0) => return Err("미디어 연결이 종료되었습니다.".into()),
            Ok(n) => read += n,
            Err(err)
                if err.kind() == std::io::ErrorKind::WouldBlock
                    || err.kind() == std::io::ErrorKind::TimedOut =>
            {
                continue;
            }
            Err(err) => return Err(err.to_string()),
        }
    }
    Ok(true)
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
