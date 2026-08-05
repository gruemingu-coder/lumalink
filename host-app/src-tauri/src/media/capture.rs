//! DXGI desktop duplication via `scrap`. Returns tightly packed BGRA.

use scrap::{Capturer, Display};
use std::io::ErrorKind;

pub struct DesktopCapture {
    capturer: Capturer,
    pub width: usize,
    pub height: usize,
}

impl DesktopCapture {
    pub fn primary() -> Result<Self, String> {
        let display = Display::primary().map_err(|e| format!("디스플레이를 열 수 없습니다: {e}"))?;
        let width = display.width();
        let height = display.height();
        let capturer =
            Capturer::new(display).map_err(|e| format!("화면 캡처를 시작할 수 없습니다: {e}"))?;
        Ok(Self {
            capturer,
            width,
            height,
        })
    }

    pub fn next_frame_bgra(&mut self) -> Result<Vec<u8>, String> {
        loop {
            match self.capturer.frame() {
                Ok(frame) => {
                    let stride = frame.len() / self.height;
                    let row_bytes = self.width * 4;
                    if stride < row_bytes {
                        return Err(format!("예상치 못한 stride={stride}"));
                    }
                    if stride == row_bytes {
                        return Ok(frame.to_vec());
                    }
                    let mut packed = vec![0u8; self.width * self.height * 4];
                    for y in 0..self.height {
                        let src = y * stride;
                        let dst = y * row_bytes;
                        packed[dst..dst + row_bytes].copy_from_slice(&frame[src..src + row_bytes]);
                    }
                    return Ok(packed);
                }
                Err(err) if err.kind() == ErrorKind::WouldBlock => {
                    std::thread::yield_now();
                }
                Err(err) => return Err(format!("화면 캡처 실패: {err}")),
            }
        }
    }
}
