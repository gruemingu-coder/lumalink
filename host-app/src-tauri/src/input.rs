//! Bridges input events forwarded by a connected client over the WebRTC
//! data channel into real OS-level mouse/keyboard events using `enigo`.
//! The host's webview JS receives the data channel message and calls
//! the `inject_input` Tauri command with the parsed event — see
//! `src/lib.ts` (host-app frontend).

use enigo::{Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum InputEvent {
    #[serde(rename = "pointermove")]
    PointerMove { x: f64, y: f64 },
    #[serde(rename = "pointerdown")]
    PointerDown { x: f64, y: f64 },
    #[serde(rename = "pointerup")]
    PointerUp { x: f64, y: f64 },
    #[serde(rename = "keydown")]
    KeyDown { key: String },
    #[serde(rename = "keyup")]
    KeyUp { key: String },
}

pub fn inject(event: InputEvent) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    match event {
        InputEvent::PointerMove { x, y } => move_normalized(&mut enigo, x, y),
        InputEvent::PointerDown { x, y } => {
            move_normalized(&mut enigo, x, y)?;
            enigo
                .button(Button::Left, Direction::Press)
                .map_err(|e| e.to_string())
        }
        InputEvent::PointerUp { x, y } => {
            move_normalized(&mut enigo, x, y)?;
            enigo
                .button(Button::Left, Direction::Release)
                .map_err(|e| e.to_string())
        }
        InputEvent::KeyDown { key } => send_key(&mut enigo, &key, Direction::Press),
        InputEvent::KeyUp { key } => send_key(&mut enigo, &key, Direction::Release),
    }
}

/// `x`/`y` arrive normalized to [0, 1] relative to the client's rendered
/// video, since the client has no idea what the host's real screen
/// resolution is. Scale them up using the host's own display size.
fn move_normalized(enigo: &mut Enigo, x: f64, y: f64) -> Result<(), String> {
    let (width, height) = enigo.main_display().map_err(|e| e.to_string())?;
    let px = (x.clamp(0.0, 1.0) * width as f64) as i32;
    let py = (y.clamp(0.0, 1.0) * height as f64) as i32;
    enigo
        .move_mouse(px, py, Coordinate::Abs)
        .map_err(|e| e.to_string())
}

fn send_key(enigo: &mut Enigo, js_key: &str, direction: Direction) -> Result<(), String> {
    let Some(key) = map_key(js_key) else {
        // Unknown/unsupported key — silently ignore rather than fail the
        // whole session over e.g. an unmapped media key.
        return Ok(());
    };
    enigo.key(key, direction).map_err(|e| e.to_string())
}

fn map_key(js_key: &str) -> Option<Key> {
    Some(match js_key {
        "Enter" => Key::Return,
        "Backspace" => Key::Backspace,
        "Tab" => Key::Tab,
        "Escape" => Key::Escape,
        " " | "Spacebar" => Key::Space,
        "ArrowUp" => Key::UpArrow,
        "ArrowDown" => Key::DownArrow,
        "ArrowLeft" => Key::LeftArrow,
        "ArrowRight" => Key::RightArrow,
        "Shift" => Key::Shift,
        "Control" => Key::Control,
        "Alt" => Key::Alt,
        "Delete" => Key::Delete,
        "Home" => Key::Home,
        "End" => Key::End,
        "PageUp" => Key::PageUp,
        "PageDown" => Key::PageDown,
        _ => {
            let mut chars = js_key.chars();
            match (chars.next(), chars.next()) {
                (Some(c), None) => Key::Unicode(c),
                _ => return None,
            }
        }
    })
}
