//! Host audio: ffmpeg WASAPI loopback → AAC ADTS → LLU2 TYPE_AUDIO.
//!
//! Falls back silently if ffmpeg/WASAPI loopback is unavailable so video
//! streaming never depends on audio success.

use std::io::Read;
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::mpsc;
use std::thread;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Reserved LLU2 packet type for audio (host → client).
pub const TYPE_AUDIO: u8 = 0x11;

pub struct AudioPacket {
    pub data: Vec<u8>,
}

pub struct AudioCapture {
    child: Child,
    rx: mpsc::Receiver<Vec<u8>>,
}

impl AudioCapture {
    /// Best-effort start. Returns `None` when no capture device/encoder works.
    pub fn try_start() -> Option<Self> {
        for device in ["loopback", "default"] {
            if let Ok(cap) = Self::spawn_wasapi(device) {
                eprintln!("LumaLink audio: WASAPI `{device}` + aac ready");
                return Some(cap);
            }
        }
        eprintln!("LumaLink audio: WASAPI unavailable — video-only stream");
        None
    }

    fn spawn_wasapi(device: &str) -> Result<Self, String> {
        let mut cmd = Command::new("ffmpeg");
        #[cfg(windows)]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = cmd
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "wasapi",
                "-i",
                device,
                "-ac",
                "2",
                "-ar",
                "48000",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-f",
                "adts",
                "pipe:1",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;

        let stdout = child.stdout.take().ok_or("ffmpeg audio stdout missing")?;
        let (tx, rx) = mpsc::sync_channel(32);
        thread::Builder::new()
            .name("lumalink-audio-out".into())
            .spawn(move || read_adts(stdout, tx))
            .map_err(|e| e.to_string())?;

        // Give ffmpeg a moment; if it exits immediately, treat as failure.
        thread::sleep(std::time::Duration::from_millis(200));
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("ffmpeg audio exited early: {status}"));
        }

        Ok(Self { child, rx })
    }

    pub fn drain(&mut self) -> Vec<AudioPacket> {
        let mut out = Vec::new();
        while let Ok(data) = self.rx.try_recv() {
            if !data.is_empty() {
                out.push(AudioPacket { data });
            }
        }
        out
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn read_adts(mut stdout: ChildStdout, tx: mpsc::SyncSender<Vec<u8>>) {
    let mut buf = [0u8; 16 * 1024];
    let mut acc: Vec<u8> = Vec::with_capacity(8 * 1024);
    loop {
        match stdout.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                acc.extend_from_slice(&buf[..n]);
                while let Some((frame, rest)) = split_one_adts(&acc) {
                    let _ = tx.try_send(frame);
                    acc = rest;
                }
                if acc.len() > 256 * 1024 {
                    acc.clear();
                }
            }
            Err(_) => break,
        }
    }
}

/// Split one ADTS AAC frame (syncword 0xFFF).
fn split_one_adts(buf: &[u8]) -> Option<(Vec<u8>, Vec<u8>)> {
    if buf.len() < 7 {
        return None;
    }
    let mut i = 0;
    while i + 1 < buf.len() {
        if buf[i] == 0xFF && (buf[i + 1] & 0xF0) == 0xF0 {
            break;
        }
        i += 1;
    }
    if i + 7 > buf.len() {
        return None;
    }
    let frame_len =
        (((buf[i + 3] & 0x03) as usize) << 11) | ((buf[i + 4] as usize) << 3) | ((buf[i + 5] as usize) >> 5);
    if frame_len < 7 || i + frame_len > buf.len() {
        return None;
    }
    Some((buf[i..i + frame_len].to_vec(), buf[i + frame_len..].to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short_buffer() {
        assert!(split_one_adts(&[0xFF, 0xF1]).is_none());
    }

    #[test]
    fn splits_adts_frame_of_length_8() {
        let mut frame = vec![0u8; 8];
        frame[0] = 0xFF;
        frame[1] = 0xF1;
        // frame_len = 8 encoded in bits spanning bytes 3..5
        let len = 8usize;
        frame[3] = (0x80u8 & 0xFC) | ((len >> 11) as u8);
        frame[4] = ((len >> 3) & 0xFF) as u8;
        frame[5] = ((len & 0x07) << 5) as u8;
        let (got, rest) = split_one_adts(&frame).expect("adts");
        assert_eq!(got.len(), 8);
        assert!(rest.is_empty());
    }
}
