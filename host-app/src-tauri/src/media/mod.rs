//! LumaLink native capture/encode/media server.
//!
//! Independent of Sunshine/Moonlight:
//! DXGI desktop duplication → H.264 via NVIDIA NVENC (`ffmpeg h264_nvenc`)
//! when available, else `libx264`. Annex-B NAL units go out over custom UDP :58714 (LLU2).

#[cfg(windows)]
mod audio;
#[cfg(windows)]
mod capture;
#[cfg(windows)]
mod encode;
#[cfg(windows)]
mod server;

#[cfg(windows)]
pub use encode::EncoderBackend;
#[cfg(windows)]
pub use server::{MediaHub, MediaStats, MEDIA_PORT};

#[cfg(not(windows))]
pub const MEDIA_PORT: u16 = 58714;

#[cfg(not(windows))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EncoderBackend {
    Nvenc,
    Software,
}

#[cfg(not(windows))]
pub struct MediaHub;

#[cfg(not(windows))]
impl MediaHub {
    pub fn new(_pin: String) -> Self {
        Self
    }
    pub fn set_pin(&self, _pin: String) {}
    pub fn issue_token(&self, _ttl: std::time::Duration) -> String {
        "00000000000000000000000000000000".into()
    }
    pub fn preferred_backend(&self) -> EncoderBackend {
        EncoderBackend::Software
    }
    pub fn start_stream(&self, _w: u32, _h: u32, _fps: u32, _bitrate: u32, _audio: bool) {}
    pub fn stop_stream(&self) {}
    pub fn snapshot_stats(&self) -> MediaStats {
        MediaStats {
            streaming: false,
            viewers: 0,
            frames_sent: 0,
            audio_sent: 0,
            backend: "software".into(),
            host_audio: false,
        }
    }
}

#[cfg(not(windows))]
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

pub fn spawn(hub: std::sync::Arc<MediaHub>) {
    #[cfg(windows)]
    {
        std::thread::Builder::new()
            .name("lumalink-media".into())
            .spawn(move || {
                if let Err(err) = server::run_blocking(hub) {
                    eprintln!("LumaLink media server stopped: {err}");
                }
            })
            .expect("failed to spawn media thread");
    }
    #[cfg(not(windows))]
    {
        let _ = hub;
    }
}
