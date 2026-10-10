// Real Windows executable (.exe) header identification.
// Parses the Portable Executable format directly: DOS header → NT headers →
// section table → resource directory, extracting VS_VERSIONINFO strings
// (FileDescription, ProductName, CompanyName, versions, copyright) and the
// embedded icon group, which is reassembled into a standalone .ico file on disk.
//
// Also handles .lnk shortcuts (see lnk.rs) and exposes a native file picker.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

use crate::AppState;

#[derive(Serialize, Clone, Debug, Default)]
pub struct ExeInfo {
    pub product_name: String,
    pub file_description: String,
    pub company_name: String,
    pub file_version: String,
    pub product_version: String,
    pub legal_copyright: String,
    pub original_filename: String,
    pub internal_name: String,
    pub comments: String,
    pub icon_path: Option<String>,
    pub file_size: u64,
    pub is_managed: bool,
    pub machine: u16,
}

// ---------- low-level PE reading ----------

struct Pe<'a> {
    data: &'a [u8],
    sections: Vec<(u32, u32, u32)>, // (virtual_address, virtual_size, raw_offset)
    resource_rva: Option<u32>,
    opt_start: usize,
}

fn u16_at(d: &[u8], o: usize) -> Option<u16> {
    if o + 2 > d.len() {
        None
    } else {
        Some(u16::from_le_bytes([d[o], d[o + 1]]))
    }
}
fn u32_at(d: &[u8], o: usize) -> Option<u32> {
    if o + 4 > d.len() {
        None
    } else {
        Some(u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]]))
    }
}

fn parse_pe(data: &[u8]) -> Option<Pe<'_>> {
    // DOS header
    if data.len() < 0x40 || &data[0..2] != b"MZ" {
        return None;
    }
    let pe_off = u32_at(data, 0x3C)? as usize;
    if pe_off + 24 > data.len() || &data[pe_off..pe_off + 4] != b"PE\0\0" {
        return None;
    }
    let coff = pe_off + 4;
    let num_sections = u16_at(data, coff + 2)? as usize;
    let opt_size = u16_at(data, coff + 16)? as usize;
    let opt_start = coff + 20;
    if opt_start + opt_size > data.len() {
        return None;
    }
    let magic = u16_at(data, opt_start)?;
    let dd_off = match magic {
        0x10B => opt_start + 96,  // PE32
        0x20B => opt_start + 112, // PE32+
        _ => return None,
    };
    let resource_rva = if dd_off + 8 <= data.len() {
        let rva = u32_at(data, dd_off + 2 * 8)?; // directory index 2 = resource table
        if rva == 0 {
            None
        } else {
            Some(rva)
        }
    } else {
        None
    };
    let mut sections = Vec::new();
    let sect_start = opt_start + opt_size;
    for i in 0..num_sections {
        let s = sect_start + i * 40;
        if s + 40 > data.len() {
            break;
        }
        let vsize = u32_at(data, s + 8).unwrap_or(0);
        let vaddr = u32_at(data, s + 12).unwrap_or(0);
        let raw = u32_at(data, s + 20).unwrap_or(0);
        sections.push((vaddr, vsize, raw));
    }
    Some(Pe {
        data,
        sections,
        resource_rva,
        opt_start,
    })
}

impl<'a> Pe<'a> {
    fn rva_to_offset(&self, rva: u32) -> Option<usize> {
        for (va, vsize, raw) in &self.sections {
            let span = std::cmp::max(*vsize, 1) ;
            if rva >= *va && rva < va.checked_add(span)? {
                return Some((*raw as usize) + (rva - va) as usize);
            }
        }
        None
    }
}

// ---------- resource directory traversal ----------

fn res_entries(data: &[u8], res_off: usize, dir_off: usize) -> Option<Vec<(u32, u32, bool)>> {
    // returns (id_or_name, offset, is_subdir)
    if res_off + dir_off + 16 > data.len() {
        return None;
    }
    let named = u16_at(data, res_off + dir_off + 12)? as usize;
    let ided = u16_at(data, res_off + dir_off + 14)? as usize;
    let mut out = Vec::new();
    for i in 0..(named + ided) {
        let e = res_off + dir_off + 16 + i * 8;
        let name = u32_at(data, e)?;
        let off = u32_at(data, e + 4)?;
        out.push((name & 0x7FFF_FFFF, off & 0x7FFF_FFFF, off & 0x8000_0000 != 0));
    }
    Some(out)
}

fn walk_leaves(
    data: &[u8],
    res_off: usize,
    dir_off: usize,
    path: &mut Vec<u32>,
    out: &mut Vec<(Vec<u32>, usize, usize)>, // (path ids, data rva, size)
) {
    if path.len() > 3 {
        return;
    }
    if let Some(entries) = res_entries(data, res_off, dir_off) {
        for (id, off, is_dir) in entries {
            if is_dir {
                path.push(id);
                walk_leaves(data, res_off, off as usize, path, out);
                path.pop();
            } else {
                // data entry descriptor
                let de = res_off + off as usize;
                if let (Some(rva), Some(size)) = (u32_at(data, de), u32_at(data, de + 4)) {
                    out.push((path.clone(), rva as usize, size as usize));
                }
            }
        }
    }
}

// ---------- VS_VERSIONINFO ----------

fn align4(o: usize) -> usize {
    (o + 3) & !3
}

fn read_utf16z(d: &[u8], o: usize) -> Option<(String, usize)> {
    // returns (string, bytes consumed including terminator)
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

fn parse_version_block(data: &[u8], start: usize, end: usize, out: &mut Vec<(String, String)>) {
    let mut o = start;
    while o + 6 <= end {
        let len = u16_at(data, o).unwrap_or(0) as usize;
        if len < 6 || o + len > end {
            break;
        }
        let value_len = u16_at(data, o + 2).unwrap_or(0) as usize;
        let wtype = u16_at(data, o + 4).unwrap_or(0);
        let (key, klen) = match read_utf16z(data, o + 6) {
            Some(k) => k,
            None => break,
        };
        let after_key = align4(o + 6 + klen);
        match key.as_str() {
            "StringFileInfo" => parse_version_block(data, after_key, o + len, out),
            "StringTable" => parse_version_block(data, after_key, o + len, out),
            _ if !key.starts_with("VS_") && !key.starts_with("Var") => {
                // an actual String entry: key -> value (UTF-16 when wtype == 1)
                if value_len > 0 && after_key < end {
                    if wtype == 1 {
                        if let Some((val, _)) = read_utf16z(data, after_key) {
                            out.push((key, val));
                        }
                    } else {
                        let endz = data[after_key..(after_key + value_len).min(end)]
                            .iter()
                            .position(|&b| b == 0)
                            .map(|p| after_key + p)
                            .unwrap_or(after_key + value_len);
                        let val = String::from_utf8_lossy(&data[after_key..endz.min(end)]).to_string();
                        out.push((key, val));
                    }
                }
            }
            _ => {}
        }
        o = align4(o + len);
        if o <= start {
            break;
        }
    }
}

fn extract_version_strings(data: &[u8], pe: &Pe<'_>) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let Some(res_rva) = pe.resource_rva else { return out };
    let Some(res_off) = pe.rva_to_offset(res_rva) else { return out };
    let mut leaves = Vec::new();
    walk_leaves(data, res_off, 0, &mut Vec::new(), &mut leaves);
    // RT_VERSION = 16
    for (_path, rva, size) in leaves.iter().filter(|(p, _, _)| !p.is_empty() && p[0] == 16) {
        let Some(off) = pe.rva_to_offset(*rva as u32) else { continue };
        let end = (off + size).min(data.len());
        parse_version_block(data, off, end, &mut out);
    }
    out
}

// ---------- embedded icon extraction ----------

fn extract_icon_ico(data: &[u8], pe: &Pe<'_>) -> Option<Vec<u8>> {
    let res_rva = pe.resource_rva?;
    let res_off = pe.rva_to_offset(res_rva)?;
    let mut leaves = Vec::new();
    walk_leaves(data, res_off, 0, &mut Vec::new(), &mut leaves);

    // RT_GROUP_ICON = 14 — pick the first group
    let group = leaves
        .iter()
        .find(|(p, _, _)| !p.is_empty() && p[0] == 14)?;
    let goff = pe.rva_to_offset(group.1 as u32)?;
    if goff + 6 > data.len() {
        return None;
    }
    let count = u16_at(data, goff + 4)? as usize;
    if count == 0 || count > 64 {
        return None;
    }

    // GRPICONDIRENTRY: width, height, colorcount, reserved, planes(2), bitcount(2), bytes(4), id(2)
    struct Entry {
        width: u8,
        height: u8,
        color_count: u8,
        planes: u16,
        bit_count: u16,
        bytes: usize,
        id: u16,
    }
    let mut entries = Vec::new();
    for i in 0..count {
        let e = goff + 6 + i * 14;
        if e + 14 > data.len() {
            break;
        }
        entries.push(Entry {
            width: data[e],
            height: data[e + 1],
            color_count: data[e + 2],
            planes: u16_at(data, e + 4).unwrap_or(0),
            bit_count: u16_at(data, e + 6).unwrap_or(0),
            bytes: u32_at(data, e + 8)? as usize,
            id: u16_at(data, e + 12)?,
        });
    }
    if entries.is_empty() {
        return None;
    }

    // RT_ICON = 3 leaves: (path[0]=3, path[1]=icon id) — map id -> (rva, size)
    let mut images: Vec<(u16, usize, usize)> = Vec::new();
    for (path, rva, size) in leaves.iter() {
        if path.len() >= 2 && path[0] == 3 {
            images.push((path[1] as u16, *rva, *size));
        }
    }

    // Build the standalone .ico: directory entries point at raw RT_ICON blobs
    let mut ico = Vec::with_capacity(6 + entries.len() * 16 + entries.len() * 4096);
    ico.extend_from_slice(&[0, 0]);
    ico.extend_from_slice(&1u16.to_le_bytes());
    ico.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    let mut blobs: Vec<Vec<u8>> = Vec::new();
    let mut offset = 6 + entries.len() * 16;
    for e in &entries {
        let blob = images
            .iter()
            .find(|(id, _, _)| *id == e.id)
            .and_then(|(_, rva, size)| {
                let off = pe.rva_to_offset(*rva as u32)?;
                let end = (off + *size).min(data.len());
                Some(data[off..end].to_vec())
            });
        let blob = match blob {
            Some(b) => b,
            None => continue,
        };
        // width/height byte is 0 for 256px entries by definition — copy verbatim
        ico.push(e.width);
        ico.push(e.height);
        ico.push(e.color_count);
        ico.push(0);
        ico.extend_from_slice(&e.planes.to_le_bytes());
        ico.extend_from_slice(&e.bit_count.to_le_bytes());
        ico.extend_from_slice(&(blob.len() as u32).to_le_bytes());
        ico.extend_from_slice(&(offset as u32).to_le_bytes());
        offset += blob.len();
        blobs.push(blob);
    }
    for b in blobs {
        ico.extend_from_slice(&b);
    }
    if ico.len() <= 6 + entries.len() * 16 {
        return None; // no image data resolved
    }
    Some(ico)
}

// ---------- public identification ----------

fn save_icon(app: &AppHandle, exe_path: &Path, ico: &[u8]) -> Option<PathBuf> {
    let dir = app
        .path()
        .app_local_data_dir()
        .ok()?
        .join("art");
    let _ = std::fs::create_dir_all(&dir);
    let stem = exe_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "game".into());
    // hash the ico bytes so different games with the same exe name never collide
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in ico {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    let dest = dir.join(format!("{stem}-{h:016x}.ico"));
    std::fs::write(&dest, ico).ok()?;
    Some(dest)
}

#[tauri::command]
pub fn identify_exe(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<ExeInfo, String> {
    let p = PathBuf::from(&path);
    let data = std::fs::read(&p).map_err(|e| format!("cannot read exe: {e}"))?;
    let pe = parse_pe(&data).ok_or("not a valid PE executable")?;
    let pairs = extract_version_strings(&data, &pe);

    let get = |k: &str| pairs
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case(k))
        .map(|(_, v)| v.clone())
        .unwrap_or_default();

    let mut info = ExeInfo {
        product_name: get("ProductName"),
        file_description: get("FileDescription"),
        company_name: get("CompanyName"),
        file_version: get("FileVersion"),
        product_version: get("ProductVersion"),
        legal_copyright: get("LegalCopyright"),
        original_filename: get("OriginalFilename"),
        internal_name: get("InternalName"),
        comments: get("Comments"),
        icon_path: None,
        file_size: data.len() as u64,
        is_managed: u32_at(&data, pe.opt_start + 14 * 8 + (if u16_at(&data, pe.opt_start).unwrap_or(0x10B) == 0x20B { 16 } else { 0 })).map(|v| v != 0).unwrap_or(false),
        machine: u16_at(&data, pe.opt_start - 16).unwrap_or(0),
    };

    if let Some(ico) = extract_icon_ico(&data, &pe) {
        info.icon_path = save_icon(&app, &p, &ico).map(|p| p.to_string_lossy().to_string());
    }
    let _ = &state; // reserved for future caching
    Ok(info)
}

#[tauri::command]
pub fn read_art(path: String) -> Result<Value, String> {
    let data = std::fs::read(&path).map_err(|e| format!("cannot read art: {e}"))?;
    let mime = if path.to_lowercase().ends_with(".png") {
        "image/png"
    } else if path.to_lowercase().ends_with(".ico") {
        "image/x-icon"
    } else if path.to_lowercase().ends_with(".jpg") || path.to_lowercase().ends_with(".jpeg") {
        "image/jpeg"
    } else if path.to_lowercase().ends_with(".webp") {
        "image/webp"
    } else {
        "application/octet-stream"
    };
    Ok(json!({ "dataUrl": format!("data:{mime};base64,{}", base64_encode(&data)), "bytes": data.len() }))
}

pub fn base64_encode(data: &[u8]) -> String {
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

// Native file picker: pick any .exe, .lnk, .bat, or folder.
#[tauri::command]
pub fn pick_game_file(app: AppHandle, mode: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut b = app.dialog().file();
    match mode.as_str() {
        "folder" => {
            let picked = b.blocking_pick_folder();
            Ok(picked.map(|f| f.to_string()))
        }
        _ => {
            b = b.add_filter("Games & shortcuts", &["exe", "lnk", "bat", "cmd"]);
            b = b.add_filter("Executables", &["exe"]);
            b = b.add_filter("Shortcuts", &["lnk"]);
            let picked = b.blocking_pick_file();
            Ok(picked.map(|f| f.to_string()))
        }
    }
}

/// Image picker for custom box art / banners / logos.
#[tauri::command]
pub fn pick_image_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let b = app
        .dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "ico"]);
    let picked = b.blocking_pick_file();
    Ok(picked.map(|f| f.to_string()))
}
