//! H.264 via ffmpeg: prefer `h264_nvenc`, else `libx264`.

use std::io::{Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{mpsc, OnceLock};
use std::thread;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Hide console window when spawning ffmpeg on Windows (avoids 0.05s flash).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn ffmpeg_command() -> Command {
    let mut cmd = Command::new("ffmpeg");
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EncoderBackend {
    Nvenc,
    Software,
}

pub struct EncodedPacket {
    pub data: Vec<u8>,
}

pub trait H264Encoder: Send {
    fn backend(&self) -> EncoderBackend;
    fn encode_bgra(&mut self, frame: &[u8]) -> Result<Vec<EncodedPacket>, String>;
}

pub fn create_encoder(
    width: u32,
    height: u32,
    fps: u32,
    bitrate_mbps: u32,
) -> Result<Box<dyn H264Encoder>, String> {
    match FfmpegEncoder::spawn(width, height, fps, bitrate_mbps, true) {
        Ok(enc) => Ok(Box::new(enc)),
        Err(err) => {
            eprintln!("LumaLink: NVENC unavailable ({err}); falling back to libx264");
            Ok(Box::new(FfmpegEncoder::spawn(
                width,
                height,
                fps,
                bitrate_mbps,
                false,
            )?))
        }
    }
}

pub fn probe_preferred_backend() -> EncoderBackend {
    if ffmpeg_has_encoder("h264_nvenc") {
        EncoderBackend::Nvenc
    } else {
        EncoderBackend::Software
    }
}

fn ffmpeg_encoder_list() -> &'static str {
    static LIST: OnceLock<String> = OnceLock::new();
    LIST.get_or_init(|| {
        ffmpeg_command()
            .args(["-hide_banner", "-encoders"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default()
    })
}

fn ffmpeg_has_encoder(name: &str) -> bool {
    ffmpeg_encoder_list().contains(name)
}

struct FfmpegEncoder {
    child: Child,
    stdin: ChildStdin,
    packet_rx: mpsc::Receiver<Vec<u8>>,
    width: u32,
    height: u32,
    backend: EncoderBackend,
}

impl FfmpegEncoder {
    fn spawn(
        width: u32,
        height: u32,
        fps: u32,
        bitrate_mbps: u32,
        want_nvenc: bool,
    ) -> Result<Self, String> {
        let bitrate = format!("{}M", bitrate_mbps.max(1));
        let fps_s = fps.clamp(15, 500).to_string();
        let size = format!("{width}x{height}");
        // Shorter GOP (~0.5s) so PLI recovery / late joiners get an IDR sooner.
        let gop = ((fps.clamp(15, 500) + 1) / 2).max(15).to_string();

        let mut args: Vec<String> = vec![
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-f".into(),
            "rawvideo".into(),
            "-pix_fmt".into(),
            "bgra".into(),
            "-s".into(),
            size,
            "-r".into(),
            fps_s,
            "-i".into(),
            "pipe:0".into(),
            "-an".into(),
            "-threads".into(),
            "0".into(),
        ];

        let backend = if want_nvenc {
            if !ffmpeg_has_encoder("h264_nvenc") {
                return Err("ffmpeg에 h264_nvenc가 없습니다".into());
            }
            args.extend([
                "-c:v".into(),
                "h264_nvenc".into(),
                "-preset".into(),
                "p1".into(),
                "-tune".into(),
                "ll".into(),
                "-rc".into(),
                "cbr".into(),
                "-b:v".into(),
                bitrate.clone(),
                "-maxrate".into(),
                bitrate.clone(),
                "-bufsize".into(),
                format!("{}M", (bitrate_mbps.max(1) / 2).max(1)),
                "-g".into(),
                gop,
                "-bf".into(),
                "0".into(),
                "-delay".into(),
                "0".into(),
                "-zerolatency".into(),
                "1".into(),
            ]);
            EncoderBackend::Nvenc
        } else {
            if !ffmpeg_has_encoder("libx264") {
                return Err(
                    "ffmpeg를 찾을 수 없습니다. PATH에 ffmpeg(full 빌드)를 넣어주세요.".into(),
                );
            }
            args.extend([
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "ultrafast".into(),
                "-tune".into(),
                "zerolatency".into(),
                "-b:v".into(),
                bitrate.clone(),
                "-maxrate".into(),
                bitrate.clone(),
                "-bufsize".into(),
                bitrate,
                "-g".into(),
                gop,
                "-bf".into(),
                "0".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ]);
            EncoderBackend::Software
        };

        args.extend(["-f".into(), "h264".into(), "pipe:1".into()]);

        let mut child = ffmpeg_command()
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("ffmpeg 실행 실패: {e}"))?;

        let stdin = child.stdin.take().ok_or("ffmpeg stdin missing")?;
        let stdout = child.stdout.take().ok_or("ffmpeg stdout missing")?;
        let (tx, rx) = mpsc::sync_channel(8);
        thread::Builder::new()
            .name("lumalink-enc-out".into())
            .spawn(move || read_annex_b(stdout, tx))
            .map_err(|e| e.to_string())?;

        Ok(Self {
            child,
            stdin,
            packet_rx: rx,
            width,
            height,
            backend,
        })
    }

    fn drain(&mut self) -> Vec<EncodedPacket> {
        let mut out = Vec::new();
        while let Ok(data) = self.packet_rx.try_recv() {
            if !data.is_empty() {
                out.push(EncodedPacket { data });
            }
        }
        out
    }
}

impl H264Encoder for FfmpegEncoder {
    fn backend(&self) -> EncoderBackend {
        self.backend
    }

    fn encode_bgra(&mut self, frame: &[u8]) -> Result<Vec<EncodedPacket>, String> {
        let expected = (self.width as usize) * (self.height as usize) * 4;
        if frame.len() < expected {
            return Err(format!(
                "프레임 크기 불일치: got {}, expected {}",
                frame.len(),
                expected
            ));
        }
        self.stdin
            .write_all(&frame[..expected])
            .map_err(|e| format!("인코더 입력 실패: {e}"))?;
        Ok(self.drain())
    }
}

impl Drop for FfmpegEncoder {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn read_annex_b(mut stdout: ChildStdout, tx: mpsc::SyncSender<Vec<u8>>) {
    let mut buf = [0u8; 256 * 1024];
    let mut acc: Vec<u8> = Vec::with_capacity(512 * 1024);
    loop {
        match stdout.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                acc.extend_from_slice(&buf[..n]);
                while let Some((au, rest)) = split_one_au(&acc) {
                    // If the consumer is behind, drop this AU and keep capturing.
                    let _ = tx.try_send(au);
                    acc = rest;
                }
            }
            Err(_) => break,
        }
    }
    if !acc.is_empty() {
        let _ = tx.try_send(acc);
    }
}

fn split_one_au(buf: &[u8]) -> Option<(Vec<u8>, Vec<u8>)> {
    let first = find_start_code(buf, 0)?;
    let second = find_start_code(buf, first + 3)?;
    if second <= first {
        return None;
    }
    Some((buf[first..second].to_vec(), buf[second..].to_vec()))
}

fn find_start_code(buf: &[u8], from: usize) -> Option<usize> {
    if from >= buf.len() {
        return None;
    }
    for i in from..buf.len().saturating_sub(3) {
        if buf[i] == 0 && buf[i + 1] == 0 {
            if buf[i + 2] == 1 {
                return Some(i);
            }
            if i + 3 < buf.len() && buf[i + 2] == 0 && buf[i + 3] == 1 {
                return Some(i);
            }
        }
    }
    None
}
