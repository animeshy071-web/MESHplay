// Storage & data management: visual breakdown of on-disk usage, save-state
// export/import to .zip, safe cache cleaning, and Recycle-Bin-routed deletion
// (never deletes silently — the UI always confirms first).

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

use crate::AppState;

fn dir_size(dir: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    total
}

fn data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
pub fn storage_breakdown(app: AppHandle) -> Value {
    let base = data_dir(&app);
    json!({
        "art": dir_size(&base.join("art")),
        "saves": dir_size(&base.join("saves")),
        "screenshots": dir_size(&base.join("screenshots")),
        "clips": dir_size(&base.join("clips")),
        "cache": dir_size(&base.join("cache")),
        "database": dir_size(&base.join("meshplay.sqlite")),
        "total": dir_size(&base),
    })
}

#[tauri::command]
pub fn delete_to_recycle_bin(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Ok(false);
    }
    trash::delete(&p).map_err(|e| format!("recycle bin failed: {e}"))?;
    Ok(true)
}

#[tauri::command]
pub fn clear_cache(app: AppHandle) -> Result<u64, String> {
    let cache = data_dir(&app).join("cache");
    let freed = dir_size(&cache);
    if cache.is_dir() {
        for e in std::fs::read_dir(&cache).map_err(|e| e.to_string())?.flatten() {
            let p = e.path();
            if p.is_dir() {
                std::fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(&p).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(freed)
}

// ---------- export/import file pickers ----------

#[tauri::command]
pub fn pick_export_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let b = app
        .dialog()
        .file()
        .add_filter("MESHplay backup", &["zip"])
        .set_file_name("meshplay-backup.zip");
    Ok(b.blocking_save_file().map(|f| f.to_string()))
}

#[tauri::command]
pub fn pick_import_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let b = app
        .dialog()
        .file()
        .add_filter("MESHplay backup", &["zip"]);
    Ok(b.blocking_pick_file().map(|f| f.to_string()))
}

// ---------- binary artifacts from the Game Bar (base64 -> disk) ----------
#[tauri::command]
pub fn write_screenshot(dir: String, name: String, b64: String) -> Result<Value, String> {
    write_b64(&dir, &name, &b64)
}

#[tauri::command]
pub fn write_clip(dir: String, name: String, b64: String) -> Result<Value, String> {
    write_b64(&dir, &name, &b64)
}

fn write_b64(dir: &str, name: &str, b64: &str) -> Result<Value, String> {
    let dir = PathBuf::from(dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
    let data = base64_decode(b64).map_err(|e| format!("bad base64: {e}"))?;
    let dest = dir.join(name);
    std::fs::write(&dest, &data).map_err(|e| format!("write failed: {e}"))?;
    Ok(json!({ "ok": true, "path": dest.to_string_lossy(), "bytes": data.len() }))
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a' + 26) as u32,
            b'0'..=b'9' => (c - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\r' | b'\n' => continue,
            _ => return Err(format!("invalid base64 char {c}")),
        };
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Ok(out)
}

// ---------- save + config export/import (.zip) ----------

fn zip_dir_recursively(zip: &mut zip::ZipWriter<std::fs::File>, dir: &Path, prefix: &str) -> Result<u32, String> {
    let mut count = 0u32;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if p.is_dir() {
                count += zip_dir_recursively(zip, &p, &format!("{prefix}{name}/"))?;
            } else {
                if zip
                    .start_file(
                        format!("{prefix}{name}"),
                        zip::write::FileOptions::<()>::default()
                            .compression_method(zip::CompressionMethod::Deflated),
                    )
                    .is_err()
                {
                    continue;
                }
                if let Ok(mut f) = std::fs::File::open(&p) {
                    let mut buf = Vec::new();
                    if f.read_to_end(&mut buf).is_ok() && zip.write_all(&buf).is_ok() {
                        count += 1;
                    }
                }
            }
        }
    }
    Ok(count)
}

#[tauri::command]
pub fn export_saves(
    app: AppHandle,
    state: State<'_, AppState>,
    dest: String,
) -> Result<Value, String> {
    let base = data_dir(&app);
    let file = std::fs::File::create(&dest).map_err(|e| format!("cannot create zip: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let mut count = 0u32;

    count += zip_dir_recursively(&mut zip, &base.join("saves"), "saves/")?;
    count += zip_dir_recursively(&mut zip, &base.join("screenshots"), "screenshots/")?;

    // configs: dump the SQLite settings/profile/library tables as JSON
    {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        let dump_table = |conn: &rusqlite::Connection, table: &str| -> Vec<Value> {
            let mut out = Vec::new();
            if let Ok(mut stmt) = conn.prepare(&format!("SELECT * FROM {table}")) {
                let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
                if let Ok(mut rows) = stmt.query([]) {
                    while let Ok(Some(row)) = rows.next() {
                        let mut obj = serde_json::Map::new();
                        for (i, c) in cols.iter().enumerate() {
                            let v: Value = match row.get_ref(i) {
                                Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                                Ok(rusqlite::types::ValueRef::Integer(n)) => json!(n),
                                Ok(rusqlite::types::ValueRef::Real(f)) => json!(f),
                                Ok(rusqlite::types::ValueRef::Text(t)) => {
                                    json!(String::from_utf8_lossy(t).to_string())
                                }
                                _ => Value::Null,
                            };
                            obj.insert(c.clone(), v);
                        }
                        out.push(Value::Object(obj));
                    }
                }
            }
            out
        };
        for (name, table) in [
            ("settings.json", "settings"),
            ("profile.json", "profile"),
            ("library.json", "games"),
            ("playtime.json", "playtime"),
            ("save-states.json", "save_states"),
        ] {
            let rows = dump_table(&conn, table);
            if zip
                .start_file(
                    format!("config/{name}"),
                    zip::write::FileOptions::<()>::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .is_ok()
            {
                let body = serde_json::to_vec_pretty(&rows).unwrap_or_default();
                let _ = zip.write_all(&body);
                count += 1;
            }
        }
    }
    let _ = zip.finish();
    Ok(json!({ "count": count, "path": dest }))
}

#[tauri::command]
pub fn import_saves(
    app: AppHandle,
    state: State<'_, AppState>,
    src: String,
) -> Result<Value, String> {
    let base = data_dir(&app);
    let file = std::fs::File::open(&src).map_err(|e| format!("cannot open zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("bad zip: {e}"))?;
    let mut restored = 0u32;
    let mut configs = 0u32;

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let Some(name) = entry.enclosed_name().map(|p| p.to_path_buf()) else { continue };
        let rel = name.to_string_lossy().replace('\\', "/");
        let mut buf = Vec::new();
        if entry.read_to_end(&mut buf).is_err() {
            continue;
        }
        if rel.starts_with("saves/") || rel.starts_with("screenshots/") {
            let dest = base.join(&name);
            if let Some(parent) = dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if std::fs::write(&dest, &buf).is_ok() {
                restored += 1;
            }
        } else if rel.starts_with("config/") {
            let Some(json_str) = String::from_utf8(buf).ok() else { continue };
            let Ok(rows) = serde_json::from_str::<Vec<Value>>(&json_str) else { continue };
            let table = rel
                .trim_start_matches("config/")
                .trim_end_matches(".json")
                .to_string();
            let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
            if merge_table(&conn, &table, rows) {
                configs += 1;
            }
        }
    }
    Ok(json!({ "files": restored, "configTables": configs }))
}

fn merge_table(conn: &rusqlite::Connection, table: &str, rows: Vec<Value>) -> bool {
    match table {
        "settings" | "profile" => {
            for r in rows {
                let (Some(k), Some(v)) = (
                    r.get("key").and_then(|v| v.as_str()).map(String::from),
                    r.get("value").and_then(|v| v.as_str()).map(String::from),
                ) else { continue };
                let _ = conn.execute(
                    &format!("INSERT OR REPLACE INTO {table} (key, value) VALUES (?1, ?2)"),
                    rusqlite::params![k, v],
                );
            }
            true
        }
        "playtime" => {
            for r in rows {
                let (Some(id), Some(secs)) = (
                    r.get("game_id").and_then(|v| v.as_str()).map(String::from),
                    r.get("seconds").and_then(|v| v.as_i64()),
                ) else { continue };
                let lp = r.get("last_played").and_then(|v| v.as_i64());
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO playtime (game_id, seconds, last_played) VALUES (?1, ?2, ?3)",
                    rusqlite::params![id, secs, lp],
                );
            }
            true
        }
        _ => false,
    }
}
