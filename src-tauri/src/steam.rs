// Steam library auto-detection — read-only parsing of libraryfolders.vdf and
// appmanifest_*.acf. No Steam API, no network: pure local Valve Data Format.

use serde::Serialize;
use std::path::{Path, PathBuf};

// ---------- minimal VDF (KeyValues) parser ----------

#[derive(Debug, Clone)]
pub struct VdfNode {
    pub key: String,
    pub value: String,
    pub children: Vec<VdfNode>,
}

impl VdfNode {
    pub fn get(&self, key: &str) -> Option<&str> {
        self.children
            .iter()
            .find(|c| c.key.eq_ignore_ascii_case(key))
            .map(|c| c.value.as_str())
    }
    pub fn get_child(&self, key: &str) -> Option<&VdfNode> {
        self.children
            .iter()
            .find(|c| c.key.eq_ignore_ascii_case(key))
    }
}

fn vdf_skip_ws(d: &[u8], mut i: usize) -> usize {
    while i < d.len() && (d[i] as char).is_ascii_whitespace() {
        // also skip comments (// to end of line)
        if i + 1 < d.len() && d[i] == b'/' && d[i + 1] == b'/' {
            while i < d.len() && d[i] != b'\n' {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    i
}

fn vdf_read_string(d: &[u8], i: &mut usize) -> Option<String> {
    *i = vdf_skip_ws(d, *i);
    if *i >= d.len() {
        return None;
    }
    if d[*i] == b'"' {
        *i += 1;
        let start = *i;
        while *i < d.len() && d[*i] != b'"' {
            if d[*i] == b'\\' {
                *i += 1;
            }
            *i += 1;
        }
        let raw = String::from_utf8_lossy(&d[start..(*i).min(d.len())]).to_string();
        if *i < d.len() {
            *i += 1;
        }
        Some(raw.replace("\\\\", "\\"))
    } else {
        // brace or bare token
        let start = *i;
        while *i < d.len() && !(d[*i] as char).is_ascii_whitespace() && d[*i] != b'{' && d[*i] != b'}' {
            *i += 1;
        }
        if start == *i {
            // consume single char (brace)
            *i += 1;
            return Some(String::new());
        }
        Some(String::from_utf8_lossy(&d[start..*i]).to_string())
    }
}

pub fn vdf_parse(data: &[u8]) -> Option<VdfNode> {
    let mut i = 0usize;
    vdf_parse_block(data, &mut i)
}

fn vdf_parse_block(d: &[u8], i: &mut usize) -> Option<VdfNode> {
    let key = vdf_read_string(d, i)?;
    let mut node = VdfNode {
        key,
        value: String::new(),
        children: Vec::new(),
    };
    *i = vdf_skip_ws(d, *i);
    if *i < d.len() && d[*i] == b'{' {
        *i += 1;
        loop {
            *i = vdf_skip_ws(d, *i);
            if *i >= d.len() {
                break;
            }
            if d[*i] == b'}' {
                *i += 1;
                break;
            }
            if let Some(child) = vdf_parse_block(d, i) {
                node.children.push(child);
            } else {
                break;
            }
        }
    } else {
        if let Some(v) = vdf_read_string(d, i) {
            node.value = v;
        }
    }
    Some(node)
}

// ---------- steam discovery ----------

#[derive(Serialize, Clone, Debug)]
pub struct SteamGame {
    pub app_id: u32,
    pub name: String,
    pub install_dir: String,
    pub exe_path: Option<String>,
    pub size_bytes: u64,
}

fn steam_root() -> Option<PathBuf> {
    // standard install location first, then registry
    let candidates = [
        PathBuf::from(r"C:\Program Files (x86)\Steam"),
        PathBuf::from(r"C:\Program Files\Steam"),
    ];
    for c in &candidates {
        if c.join("steamapps").is_dir() {
            return Some(c.clone());
        }
    }
    // registry: HKCU\Software\Valve\Steam -> SteamPath (RegGetValueW)
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
        let subkey: Vec<u16> = "Software\\Valve\\Steam\0".encode_utf16().collect();
        let value: Vec<u16> = "SteamPath\0".encode_utf16().collect();
        let mut buf = [0u16; 512];
        let mut size: u32 = (buf.len() * 2) as u32;
        let status = RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buf.as_mut_ptr() as *mut core::ffi::c_void,
            &mut size,
        );
        if status == 0 {
            let end = buf.iter().position(|&w| w == 0).unwrap_or(0);
            let s = String::from_utf16_lossy(&buf[..end]).replace('/', "\\");
            let p = PathBuf::from(s);
            if p.is_dir() {
                return Some(p);
            }
        }
    }
    None
}

fn parse_manifest(path: &Path) -> Option<SteamGame> {
    let data = std::fs::read(path).ok()?;
    let root = vdf_parse(&data)?;
    let app_state = root.get_child("AppState")?;
    let app_id: u32 = app_state.get("appid")?.parse().ok()?;
    let name = app_state.get("name")?.to_string();
    let install_dir = app_state.get("installdir")?.to_string();
    let size_bytes: u64 = app_state.get("SizeOnDisk").and_then(|s| s.parse().ok()).unwrap_or(0);
    Some(SteamGame {
        app_id,
        name,
        install_dir,
        exe_path: None,
        size_bytes,
    })
}

fn find_main_exe(install: &Path, install_dir: &str) -> Option<PathBuf> {
    const JUNK: [&str; 6] = ["crash", "unins", "redist", "vc_redist", "dxsetup", "eula"];
    let mut candidates: Vec<PathBuf> = Vec::new();
    // top-level exes
    if let Ok(rd) = std::fs::read_dir(install) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().map(|x| x.eq_ignore_ascii_case("exe")).unwrap_or(false) {
                candidates.push(p);
            }
        }
    }
    // one level deep (common Unity/Unreal layout: <game>_Data is a sibling, exe sometimes nested)
    if candidates.is_empty() {
        if let Ok(rd) = std::fs::read_dir(install) {
            for e in rd.flatten() {
                if e.path().is_dir() {
                    if let Ok(sub) = std::fs::read_dir(e.path()) {
                        for f in sub.flatten() {
                            let p = f.path();
                            if p.extension().map(|x| x.eq_ignore_ascii_case("exe")).unwrap_or(false) {
                                candidates.push(p);
                            }
                        }
                    }
                }
            }
        }
    }
    if candidates.is_empty() {
        return None;
    }
    let clean = |p: &Path| -> Option<String> {
        let stem = p.file_stem()?.to_string_lossy().to_lowercase();
        for j in JUNK {
            if stem.contains(j) {
                return None;
            }
        }
        Some(stem)
    };
    let dir_name = install_dir.to_lowercase();
    // prefer exe matching the install dir name
    if let Some(m) = candidates
        .iter()
        .find(|p| clean(p).map(|s| s == dir_name).unwrap_or(false))
    {
        return Some(m.clone());
    }
    // else largest clean exe
    let mut best: Option<(u64, PathBuf)> = None;
    for p in &candidates {
        if clean(p).is_none() {
            continue;
        }
        let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        if best.as_ref().map(|(s, _)| size > *s).unwrap_or(true) {
            best = Some((size, p.clone()));
        }
    }
    best.map(|(_, p)| p)
}

pub fn scan_steam_libraries() -> Vec<SteamGame> {    let Some(root) = steam_root() else { return Vec::new() };
    let vdf = root.join("steamapps").join("libraryfolders.vdf");
    let mut libraries: Vec<PathBuf> = Vec::new();
    if let Ok(data) = std::fs::read(&vdf) {
        if let Some(node) = vdf_parse(&data) {
            if let Some(libs) = node.get_child("libraryfolders") {
                for child in &libs.children {
                    if let Some(p) = child.get("path") {
                        let pb = PathBuf::from(p);
                        if pb.is_dir() {
                            libraries.push(pb);
                        }
                    }
                }
            }
        }
    }
    if libraries.is_empty() {
        libraries.push(root.clone());
    }

    let mut games = Vec::new();
    for lib in libraries {
        let apps = lib.join("steamapps");
        let Ok(rd) = std::fs::read_dir(&apps) else { continue };
        for entry in rd.flatten() {
            let p = entry.path();
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if !name.starts_with("appmanifest_") || !name.ends_with(".acf") {
                continue;
            }
            if let Some(mut game) = parse_manifest(&p) {
                if game.name.eq_ignore_ascii_case("steamworks common redistributables")
                    || game.name.eq_ignore_ascii_case("proton")
                {
                    continue;
                }
                let common = apps.join("common").join(&game.install_dir);
                game.exe_path = find_main_exe(&common, &game.install_dir)
                    .map(|p| p.to_string_lossy().to_string());
                games.push(game);
            }
        }
    }
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    games
}

/// Auto-detect every installed Steam game (read-only VDF + ACF parsing).
#[tauri::command]
pub fn scan_steam() -> Vec<SteamGame> {
    scan_steam_libraries()
}
