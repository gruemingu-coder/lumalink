//! Real (non-mock) installed-game discovery: locates the local Steam
//! install via the Windows registry, then parses `libraryfolders.vdf`
//! and each library's `appmanifest_*.acf` files to list fully-installed
//! games. VDF is a simple, undocumented-but-stable key/value format, so
//! this uses a tiny hand-rolled parser instead of pulling in a crate.

use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct InstalledGame {
    pub id: String,
    pub title: String,
}

pub fn scan_installed_games() -> Vec<InstalledGame> {
    let mut games = Vec::new();
    let mut seen = HashSet::new();

    for steamapps in steam_library_dirs() {
        let Ok(entries) = fs::read_dir(&steamapps) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
                continue;
            }
            let Ok(contents) = fs::read_to_string(&path) else {
                continue;
            };
            let Some(app_id) = vdf_value(&contents, "appid") else {
                continue;
            };
            let Some(name) = vdf_value(&contents, "name") else {
                continue;
            };
            // StateFlags & 4 == "fully installed" in Steam's manifest format.
            let state_flags: u32 = vdf_value(&contents, "StateFlags")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            if state_flags & 4 == 0 {
                continue;
            }

            let id = format!("steam-{app_id}");
            if seen.insert(id.clone()) {
                games.push(InstalledGame { id, title: name });
            }
        }
    }

    games.sort_by(|a, b| a.title.cmp(&b.title));
    games
}

pub fn launch_game(game_id: &str) -> Result<(), String> {
    let app_id = game_id
        .strip_prefix("steam-")
        .ok_or_else(|| "알 수 없는 게임 ID입니다.".to_string())?;
    open_steam_uri(&format!("steam://run/{app_id}"))
}

/// Switches Steam into "Big Picture" mode — its gamepad-friendly,
/// full-screen UI. Handy for controller-based play and for making a
/// streamed session feel more like a console.
pub fn launch_big_picture() -> Result<(), String> {
    open_steam_uri("steam://open/bigpicture")
}

fn open_steam_uri(uri: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", uri])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = uri;
        Err("Steam 실행/제어는 현재 Windows 호스트에서만 지원됩니다.".to_string())
    }
}

/// Extract `"key" "value"` from a VDF-formatted string. Good enough for
/// the flat manifest/library files Steam writes; does not attempt to
/// understand nested `{ }` blocks.
fn vdf_value(contents: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let start = contents.find(&needle)?;
    let after_key = &contents[start + needle.len()..];
    let first_quote = after_key.find('"')?;
    let rest = &after_key[first_quote + 1..];
    let second_quote = rest.find('"')?;
    Some(rest[..second_quote].to_string())
}

#[cfg(target_os = "windows")]
fn steam_install_path() -> Option<PathBuf> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey("Software\\Valve\\Steam").ok()?;
    let path: String = key.get_value("SteamPath").ok()?;
    Some(PathBuf::from(path))
}

#[cfg(not(target_os = "windows"))]
fn steam_install_path() -> Option<PathBuf> {
    None
}

fn steam_library_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let Some(steam_path) = steam_install_path() else {
        return dirs;
    };

    let default_steamapps = steam_path.join("steamapps");
    let library_vdf = default_steamapps.join("libraryfolders.vdf");
    dirs.push(default_steamapps);

    if let Ok(contents) = fs::read_to_string(&library_vdf) {
        for line in contents.lines() {
            if let Some(value) = vdf_value(line, "path") {
                let normalized = value.replace("\\\\", "\\");
                dirs.push(Path::new(&normalized).join("steamapps"));
            }
        }
    }

    dirs.into_iter().filter(|d| d.exists()).collect()
}
