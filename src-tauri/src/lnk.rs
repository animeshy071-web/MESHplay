// Windows .lnk shell shortcut parser — resolves the real target path,
// working directory, arguments, and icon location straight from the binary
// ShellLink format (no COM, no shell APIs, fully offline).

use serde_json::{json, Value};
use std::path::PathBuf;

const LNK_MAGIC: u32 = 0x0000_004C;

fn u16_at(d: &[u8], o: usize) -> Option<u16> {
    if o + 2 > d.len() { None } else { Some(u16::from_le_bytes([d[o], d[o + 1]])) }
}
fn u32_at(d: &[u8], o: usize) -> Option<u32> {
    if o + 4 > d.len() { None } else { Some(u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])) }
}

fn read_ansi_z(d: &[u8], o: usize) -> Option<(String, usize)> {
    let mut i = o;
    while i < d.len() {
        if d[i] == 0 {
            return Some((String::from_utf8_lossy(&d[o..i]).to_string(), i - o + 1));
        }
        i += 1;
    }
    None
}

fn read_utf16z(d: &[u8], o: usize) -> Option<(String, usize)> {
    let mut s = String::new();
    let mut i = o;
    while i + 2 <= d.len() {
        let w = u16::from_le_bytes([d[i], d[i + 1]]);
        i += 2;
        if w == 0 {
            return Some((s, i - o));
        }
        s.push(char::from_u32(w as u32).unwrap_or('\u{fffd}'));
    }
    None
}

#[derive(Debug, Default, Clone)]
pub struct Shortcut {
    pub target: String,
    pub work_dir: String,
    pub arguments: String,
    pub icon: String,
}

pub fn parse_lnk(path: &PathBuf) -> Result<Shortcut, String> {
    let data = std::fs::read(path).map_err(|e| format!("cannot read lnk: {e}"))?;
    if data.len() < 76 || u32_at(&data, 0) != Some(LNK_MAGIC) {
        return Err("not a shell link".into());
    }
    let flags = u32_at(&data, 20).unwrap_or(0);
    let header_size = u32_at(&data, 0).unwrap_or(0x4C) as usize;
    let mut sc = Shortcut::default();
    let mut o = header_size;

    // LinkTargetIDList (bit 0)
    if flags & 0x1 != 0 {
        let list_size = u16_at(&data, o).unwrap_or(0) as usize;
        o += 2 + list_size;
    }
    // LinkInfo (bit 2) — LocalBasePath is the real target on disk
    if flags & 0x2 != 0 && o + 4 <= data.len() {
        let info_size = u32_at(&data, o).unwrap_or(0) as usize;
        let info_start = o;
        if info_size >= 0x1C && info_start + info_size <= data.len() {
            let local_base_off = u32_at(&data, info_start + 16).unwrap_or(0) as usize;
            let common_off = u32_at(&data, info_start + 24).unwrap_or(0) as usize;
            if local_base_off > 0 {
                if let Some((p, _)) = read_ansi_z(&data, info_start + local_base_off) {
                    sc.target = p;
                }
            }
            if common_off > 0 {
                if let Some((p, _)) = read_ansi_z(&data, info_start + common_off) {
                    if !p.is_empty() {
                        sc.target = p; // common path suffix wins when local missing
                    }
                }
            }
        }
        o = info_start + info_size;
    }
    // String data section: (bit 2 | 4 | 8 | 0x10 | 0x20 | 0x40) — unicode flag bit 7 (0x80)
    let unicode = flags & 0x80 != 0;
    let read_str = |o: &mut usize| -> String {
        if *o + 2 > data.len() {
            return String::new();
        }
        let count = u16_at(&data, *o).unwrap_or(0) as usize;
        *o += 2;
        if unicode {
            let chars = count; // count is in characters
            let mut s = String::new();
            for i in 0..chars {
                if let Some(w) = u16_at(&data, *o + i * 2) {
                    if w == 0 {
                        break;
                    }
                    s.push(char::from_u32(w as u32).unwrap_or('\u{fffd}'));
                }
            }
            *o += chars * 2;
            s
        } else {
            let bytes = count;
            let mut s = String::new();
            for i in 0..bytes {
                if i >= bytes || *o + i >= data.len() {
                    break;
                }
                if data[*o + i] == 0 {
                    break;
                }
                s.push(data[*o + i] as char);
            }
            *o += bytes;
            s
        }
    };
    if flags & 0x4 != 0 {
        let _name = read_str(&mut o); // description label
    }
    if flags & 0x8 != 0 {
        let rel = read_str(&mut o);
        if sc.target.is_empty() && !rel.is_empty() {
            // relative path: resolve against the lnk's own folder
            if let Some(parent) = path.parent() {
                sc.target = parent.join(rel.trim_start_matches("\\\\")).to_string_lossy().to_string();
            } else {
                sc.target = rel;
            }
        }
    }
    if flags & 0x10 != 0 {
        sc.work_dir = read_str(&mut o);
    }
    if flags & 0x20 != 0 {
        sc.arguments = read_str(&mut o);
    }
    if flags & 0x40 != 0 {
        sc.icon = read_str(&mut o);
    }

    // Fallback: scan the raw file for any embedded absolute path if parsing came up empty
    if sc.target.is_empty() {
        sc.target = scan_for_path(&data);
    }
    if sc.target.is_empty() {
        return Err("shortcut has no resolvable target".into());
    }
    if sc.work_dir.is_empty() {
        if let Some(parent) = PathBuf::from(&sc.target).parent() {
            sc.work_dir = parent.to_string_lossy().to_string();
        }
    }
    Ok(sc)
}

fn scan_for_path(data: &[u8]) -> String {    // UTF-16 strings first
    let mut i = 0;
    while i + 2 <= data.len() {
        let w = u16::from_le_bytes([data[i], data[i + 1]]);
        if w == b':' as u16 + (0u16 << 8) || (w & 0xFF) == b':' as u16 {
            // find the start of a "X:\"-style utf16 path ending at this ':'
            let start = i.saturating_sub(2);
            if start + 2 <= data.len() {
                if let Some((s, _)) = read_utf16z(&data[start.min(data.len() - 2)..], 0) {
                    if s.len() >= 3 && s.as_bytes()[1] == b':' && s.as_bytes()[2] == b'\\' {
                        return s;
                    }
                }
            }
        }
        i += 2;
    }
    // ANSI strings
    for i in 0..data.len() {
        if data[i] == b':' && i + 2 < data.len() && data[i + 1] == b'\\' {
            let start = i.saturating_sub(4);
            if let Some((s, _)) = read_ansi_z(&data[start..], 0) {
                let trimmed = s.trim_start_matches(|c: char| !c.is_ascii_graphic() || c == ' ' || c == '"');
                if trimmed.len() >= 3 && trimmed.as_bytes()[1] == b':' && trimmed.as_bytes()[2] == b'\\' {
                    return trimmed.to_string();
                }
            }
        }
    }
    String::new()
}

/// Resolve a .lnk shortcut to its real target + arguments + working dir.
#[tauri::command]
pub fn resolve_shortcut(path: String) -> Result<Value, String> {
    let sc = parse_lnk(&PathBuf::from(&path))?;
    Ok(json!({
        "target": sc.target,
        "arguments": sc.arguments,
        "workDir": sc.work_dir,
        "icon": sc.icon,
    }))
}
