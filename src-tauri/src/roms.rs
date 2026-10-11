// ROM folder scanning with hash-based identification. Walks a user-chosen
// folder, CRC32-hashes every recognized ROM file, and tags the platform by
// extension. Matched offline against the local hash database (src/system/romdb).

use serde::Serialize;
use std::io::Read;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize, Clone, Debug)]
pub struct RomInfo {
    pub path: String,
    pub name: String,
    pub platform: String,
    pub crc32: u32,
    pub size: u64,
}

fn platform_for(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "ch8" => "CHIP-8",
        "gb" | "gbc" => "Game Boy",
        "gba" => "Game Boy Advance",
        "nes" | "fds" | "unf" => "NES",
        "sfc" | "smc" => "SNES",
        "sms" => "Master System",
        "gg" => "Game Gear",
        "md" | "gen" | "smd" => "Mega Drive",
        "32x" => "Sega 32X",
        "pce" | "sgx" => "PC Engine",
        "n64" | "z64" | "v64" => "Nintendo 64",
        "a26" => "Atari 2600",
        "a78" => "Atari 7800",
        "lnx" => "Atari Lynx",
        "col" => "ColecoVision",
        "vect" | "vec" => "Vectrex",
        "ws" | "wsc" => "WonderSwan",
        "mx1" | "mx2" | "dsk" => "MSX",
        "nds" => "Nintendo DS",
        _ => return None,
    })
}

/// Disc/tape/zip images are ambiguous by extension — the parent folder names
/// the system (e.g. "ROMs/PS1/", "Games/Wii/"). Cartridge extensions above are
/// unambiguous and take priority.
fn disc_platform(path: &Path) -> Option<&'static str> {
    let hay = format!(
        "{} {}",
        path.parent().map(|p| p.to_string_lossy()).unwrap_or_default(),
        path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default()
    )
    .to_lowercase();
    let has = |needle: &str| hay.contains(needle);
    if has("ps3") || has("rpcs3") {
        return Some("PlayStation 3");
    }
    if has("ps2") || has("playstation2") {
        return Some("PlayStation 2");
    }
    if has("psx") || has("ps1") || has("playstation") {
        return Some("PlayStation");
    }
    if has("dreamcast") {
        return Some("Dreamcast");
    }
    if has("saturn") {
        return Some("Sega Saturn");
    }
    if has("gamecube") {
        return Some("GameCube");
    }
    if has("wii") && !has("gamecube") {
        return Some("Wii");
    }
    if has("psp") {
        return Some("PSP");
    }
    if has("3ds") {
        return Some("Nintendo 3DS");
    }
    if has("segacd") || has("segacd") || has("mega cd") || has("megacd") {
        return Some("Sega CD");
    }
    if has("pcfx") || has("pc-fx") {
        return Some("PC-FX");
    }
    if has("neogeo") || has("neo geo") {
        return Some("Neo Geo");
    }
    if has("arcade") || has("mame") || has("fbneo") || has("fba") {
        return Some("Arcade");
    }
    None
}

fn is_disc_ext(ext: &str) -> bool {
    matches!(ext, "cue" | "iso" | "chd" | "img" | "pbp" | "cso" | "gcm" | "rvz" | "gdi" | "cdi" | "ccd" | "toc" | "zip" | "7z")
}

fn crc32_of(path: &Path, cap: u64) -> std::io::Result<u32> {
    let mut f = std::fs::File::open(path)?;
    let mut table = [0u32; 256];
    for (n, e) in table.iter_mut().enumerate() {
        let mut c = n as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
        }
        *e = c;
    }
    let mut crc: u32 = 0xFFFF_FFFF;
    let mut buf = [0u8; 64 * 1024];
    let mut remaining = cap;
    loop {
        let want = std::cmp::min(buf.len() as u64, remaining) as usize;
        if want == 0 {
            break;
        }
        let got = f.read(&mut buf[..want])?;
        if got == 0 {
            break;
        }
        for &b in &buf[..got] {
            crc = table[((crc ^ b as u32) & 0xFF) as usize] ^ (crc >> 8);
        }
        remaining -= got as u64;
    }
    Ok(crc ^ 0xFFFF_FFFF)
}

fn walk(dir: &Path, depth: u32, out: &mut Vec<RomInfo>) {
    if depth > 4 || out.len() >= 2000 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.is_dir() {
            // skip obviously non-ROM folders
            let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
            if name == "saves" || name == "state" || name == "savestates" || name == "system" || name == "cache" {
                continue;
            }
            walk(&p, depth + 1, out);
        } else {
            let ext = p
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            let platform = match platform_for(&ext) {
                Some(pl) => Some(pl),
                None if is_disc_ext(&ext) => disc_platform(&p),
                None => None,
            };
            let Some(platform) = platform else { continue };
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let disc = is_disc_ext(&ext);
            let max = if disc { 8u64 * 1024 * 1024 * 1024 } else { 256 * 1024 * 1024 };
            if size == 0 || size > max {
                continue;
            }
            // CRC hashing only helps cartridge-sized ROMs; disc images skip it
            let crc = if disc || size > 512 * 1024 * 1024 {
                0
            } else {
                crc32_of(&p, 128 * 1024 * 1024).unwrap_or(0)
            };
            let name = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            out.push(RomInfo {
                path: p.to_string_lossy().to_string(),
                name,
                platform: platform.to_string(),
                crc32: crc,
                size,
            });
        }
    }
}

#[tauri::command]
pub fn scan_roms(folder: String) -> Result<Vec<RomInfo>, String> {
    let mut out = Vec::new();
    walk(Path::new(&folder), 0, &mut out);
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn pick_rom_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    Ok(picked.map(|f| f.to_string()))
}

/// Read a ROM from disk (scanned absolute paths) as base64 for the UI.
#[tauri::command]
pub fn read_rom_bytes(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("cannot read rom: {e}"))?;
    Ok(base64_encode_rom(&data))
}

fn base64_encode_rom(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}
