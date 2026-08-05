//! Resolves a working ffmpeg binary without requiring the user to install
//! it or add it to PATH themselves.
//!
//! Resolution order:
//! 1. `ffmpeg` already on PATH — respected as-is, zero behavior change.
//! 2. A copy this app previously auto-installed under the app's local
//!    data directory.
//! 3. Download a portable static Windows build (BtbN/FFmpeg-Builds,
//!    the same "full GPL" build family recommended for `h264_nvenc`
//!    support) into the app's local data directory and extract it.
//!
//! Progress is reported to the frontend via the `alavex-ffmpeg-setup`
//! window event so the UI can show a one-time "ffmpeg 준비 중..." banner.
//! None of this requires the user to touch PATH or run an installer.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const FFMPEG_DOWNLOAD_URL: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

#[derive(Clone, serde::Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum SetupProgress {
    Downloading { percent: u8 },
    Extracting,
    Ready { path: String },
    Error { message: String },
}

fn app_data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("AlaveX")
        .join("ffmpeg")
}

fn build_command(program: impl AsRef<Path>) -> Command {
    let mut cmd = Command::new(program.as_ref());
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn path_works(path: &Path) -> bool {
    build_command(path)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Looks for an already-extracted `ffmpeg.exe` under the app data dir,
/// either directly or one level down (as BtbN's zip layout nests it under
/// `ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe` — the exact folder name
/// can change with each build, so search generically instead of hardcoding
/// it).
fn find_cached_binary() -> Option<PathBuf> {
    let dir = app_data_dir();
    let direct = dir.join("ffmpeg.exe");
    if direct.is_file() {
        return Some(direct);
    }
    let entries = std::fs::read_dir(&dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let nested = path.join("bin").join("ffmpeg.exe");
        if nested.is_file() {
            return Some(nested);
        }
    }
    None
}

static RESOLVED: OnceLock<Mutex<PathBuf>> = OnceLock::new();

fn resolved_cell() -> &'static Mutex<PathBuf> {
    RESOLVED.get_or_init(|| {
        let initial = if path_works(Path::new("ffmpeg")) {
            PathBuf::from("ffmpeg")
        } else if let Some(cached) = find_cached_binary() {
            cached
        } else {
            PathBuf::from("ffmpeg")
        };
        Mutex::new(initial)
    })
}

/// The ffmpeg binary path to spawn. Defaults to bare `"ffmpeg"` (resolved
/// via PATH by the OS) until an auto-installed copy is found/downloaded.
pub fn ffmpeg_path() -> PathBuf {
    resolved_cell().lock().unwrap().clone()
}

/// True if `ffmpeg_path()` currently resolves to a working binary.
pub fn is_ready() -> bool {
    path_works(&ffmpeg_path())
}

/// Downloads + extracts a portable ffmpeg build if one isn't already
/// available, emitting `alavex-ffmpeg-setup` progress events on `app`
/// along the way. Safe to call repeatedly — it's a no-op once ready.
pub fn ensure_ffmpeg_installed(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;

    let emit = |p: SetupProgress| {
        let _ = app.emit("alavex-ffmpeg-setup", p);
    };

    if is_ready() {
        let path = ffmpeg_path().to_string_lossy().into_owned();
        emit(SetupProgress::Ready { path: path.clone() });
        return Ok(path);
    }

    let dir = app_data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("폴더 생성 실패: {e}"))?;
    let zip_path = dir.join("ffmpeg-download.zip");

    let result = (|| -> Result<PathBuf, String> {
        emit(SetupProgress::Downloading { percent: 0 });
        let resp = ureq::get(FFMPEG_DOWNLOAD_URL)
            .call()
            .map_err(|e| format!("ffmpeg 다운로드 요청 실패: {e}"))?;
        let total: u64 = resp
            .header("Content-Length")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        let mut reader = resp.into_reader();
        let mut file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
        let mut buf = [0u8; 256 * 1024];
        let mut downloaded: u64 = 0;
        let mut last_pct: u8 = 0;
        loop {
            let n = reader
                .read(&mut buf)
                .map_err(|e| format!("다운로드 중 오류: {e}"))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            downloaded += n as u64;
            if total > 0 {
                let pct = ((downloaded.saturating_mul(100)) / total).min(100) as u8;
                if pct != last_pct {
                    last_pct = pct;
                    emit(SetupProgress::Downloading { percent: pct });
                }
            }
        }
        drop(file);

        emit(SetupProgress::Extracting);
        let zip_file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
        let mut archive =
            zip::ZipArchive::new(zip_file).map_err(|e| format!("압축 해제 실패: {e}"))?;
        archive
            .extract(&dir)
            .map_err(|e| format!("압축 해제 실패: {e}"))?;
        let _ = std::fs::remove_file(&zip_path);

        let resolved =
            find_cached_binary().ok_or_else(|| "ffmpeg.exe를 찾을 수 없습니다.".to_string())?;
        if !path_works(&resolved) {
            return Err("다운로드한 ffmpeg 실행 파일이 정상 동작하지 않습니다.".to_string());
        }
        Ok(resolved)
    })();

    match result {
        Ok(resolved) => {
            *resolved_cell().lock().unwrap() = resolved.clone();
            let path = resolved.to_string_lossy().into_owned();
            emit(SetupProgress::Ready { path: path.clone() });
            Ok(path)
        }
        Err(message) => {
            emit(SetupProgress::Error {
                message: message.clone(),
            });
            Err(message)
        }
    }
}
