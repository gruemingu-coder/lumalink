//! Virtual Xbox 360 controller output via the ViGEmBus driver, driven by
//! gamepad state forwarded from the connected client's browser Gamepad
//! API. Any controller the browser recognizes as a "standard" gamepad —
//! Xbox One/Series, DualSense, DualShock 4, and most others — works
//! transparently, because Chromium/WebView2 normalizes them all into the
//! same 17-button / 4-axis layout before this code ever sees it. We just
//! re-emit that normalized state as a virtual XInput controller, which
//! essentially every PC game already understands.
//!
//! Requires the ViGEmBus driver to be installed on the host PC:
//! <https://github.com/ViGEm/ViGEmBus/releases>
//! Without it, `update()` fails gracefully and streaming/input still work
//! (only gamepad passthrough is unavailable).

use serde::Deserialize;

#[derive(Deserialize, Clone, Default)]
pub struct GamepadState {
    pub connected: bool,
    /// Standard Gamepad API button values, index-aligned, 0.0..=1.0.
    pub buttons: Vec<f64>,
    /// Standard Gamepad API axes, index-aligned, -1.0..=1.0.
    pub axes: Vec<f64>,
}

#[cfg(windows)]
mod imp {
    use super::GamepadState;
    use std::collections::HashMap;
    use std::sync::Mutex;
    use vigem_client::{Client, TargetId, XButtons, XGamepad, Xbox360Wired};

    pub struct GamepadHub {
        targets: Mutex<HashMap<u32, Xbox360Wired<Client>>>,
    }

    impl GamepadHub {
        pub fn new() -> Self {
            Self {
                targets: Mutex::new(HashMap::new()),
            }
        }

        pub fn update(&self, index: u32, state: &GamepadState) -> Result<(), String> {
            if !state.connected {
                self.remove(index);
                return Ok(());
            }

            let mut targets = self.targets.lock().unwrap();
            if !targets.contains_key(&index) {
                let client = Client::connect().map_err(|e| {
                    format!("ViGEmBus에 연결할 수 없습니다(드라이버 설치 필요): {e:?}")
                })?;
                let mut target = Xbox360Wired::new(client, TargetId::XBOX360_WIRED);
                target
                    .plugin()
                    .map_err(|e| format!("가상 컨트롤러 생성 실패: {e:?}"))?;
                target
                    .wait_ready()
                    .map_err(|e| format!("가상 컨트롤러 준비 실패: {e:?}"))?;
                targets.insert(index, target);
            }

            let target = targets.get_mut(&index).expect("just inserted");
            let gamepad = to_xgamepad(state);
            target
                .update(&gamepad)
                .map_err(|e| format!("컨트롤러 상태 갱신 실패: {e:?}"))
        }

        pub fn remove(&self, index: u32) {
            self.targets.lock().unwrap().remove(&index);
        }

        pub fn clear(&self) {
            self.targets.lock().unwrap().clear();
        }
    }

    fn axis_i16(v: f64) -> i16 {
        (v.clamp(-1.0, 1.0) * 32767.0) as i16
    }

    fn trigger_u8(v: f64) -> u8 {
        (v.clamp(0.0, 1.0) * 255.0) as u8
    }

    /// Standard Gamepad API button indices: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB,
    /// 6 LT (analog), 7 RT (analog), 8 Back/Select, 9 Start, 10 L-stick
    /// click, 11 R-stick click, 12-15 D-pad, 16 Guide/Home.
    fn to_xgamepad(state: &GamepadState) -> XGamepad {
        let pressed = |i: usize| state.buttons.get(i).copied().unwrap_or(0.0) > 0.5;
        let mut buttons: u16 = 0;
        if pressed(12) {
            buttons |= XButtons::UP;
        }
        if pressed(13) {
            buttons |= XButtons::DOWN;
        }
        if pressed(14) {
            buttons |= XButtons::LEFT;
        }
        if pressed(15) {
            buttons |= XButtons::RIGHT;
        }
        if pressed(9) {
            buttons |= XButtons::START;
        }
        if pressed(8) {
            buttons |= XButtons::BACK;
        }
        if pressed(10) {
            buttons |= XButtons::LTHUMB;
        }
        if pressed(11) {
            buttons |= XButtons::RTHUMB;
        }
        if pressed(4) {
            buttons |= XButtons::LB;
        }
        if pressed(5) {
            buttons |= XButtons::RB;
        }
        if pressed(16) {
            buttons |= XButtons::GUIDE;
        }
        if pressed(0) {
            buttons |= XButtons::A;
        }
        if pressed(1) {
            buttons |= XButtons::B;
        }
        if pressed(2) {
            buttons |= XButtons::X;
        }
        if pressed(3) {
            buttons |= XButtons::Y;
        }

        let axis = |i: usize| state.axes.get(i).copied().unwrap_or(0.0);
        XGamepad {
            buttons: XButtons { raw: buttons },
            left_trigger: trigger_u8(state.buttons.get(6).copied().unwrap_or(0.0)),
            right_trigger: trigger_u8(state.buttons.get(7).copied().unwrap_or(0.0)),
            thumb_lx: axis_i16(axis(0)),
            thumb_ly: axis_i16(-axis(1)),
            thumb_rx: axis_i16(axis(2)),
            thumb_ry: axis_i16(-axis(3)),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::GamepadState;

    pub struct GamepadHub;

    impl GamepadHub {
        pub fn new() -> Self {
            Self
        }
        pub fn update(&self, _index: u32, _state: &GamepadState) -> Result<(), String> {
            Err("이 플랫폼에서는 컨트롤러 패스스루가 지원되지 않습니다.".into())
        }
        pub fn remove(&self, _index: u32) {}
        pub fn clear(&self) {}
    }
}

pub use imp::GamepadHub;
