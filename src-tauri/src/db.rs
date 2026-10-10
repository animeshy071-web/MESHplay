// SQLite persistence — the local embedded database. Library, playtime,
// settings, profile, screenshots, pins: all on the local drive, zero telemetry.
// Exposed to the UI as a tiny generic SQL bridge plus typed path helpers.

use rusqlite::{params_from_iter, Connection, ToSql};
use serde_json::{json, Value};
use std::path::Path;
use tauri::{Manager, State};

use crate::AppState;

pub fn open(path: &Path) -> Result<Connection, String> {
    Connection::open(path).map_err(|e| format!("sqlite open failed: {e}"))
}

pub fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS games (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            tagline     TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            kind        TEXT NOT NULL DEFAULT 'chip8',
            rom         TEXT,
            exe_path    TEXT,
            args        TEXT,
            work_dir    TEXT,
            platform    TEXT NOT NULL DEFAULT 'CHIP-8',
            publisher   TEXT NOT NULL DEFAULT '',
            developer   TEXT NOT NULL DEFAULT '',
            year        INTEGER,
            colors      TEXT NOT NULL DEFAULT '',
            art         TEXT,
            art_mime    TEXT,
            crc32       INTEGER,
            source      TEXT NOT NULL DEFAULT 'builtin',
            added_at    INTEGER NOT NULL DEFAULT 0,
            last_played INTEGER,
            seconds     INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS playtime (
            game_id     TEXT PRIMARY KEY,
            seconds     INTEGER NOT NULL DEFAULT 0,
            last_played INTEGER
        );
        CREATE TABLE IF NOT EXISTS profile (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS screenshots (
            id         TEXT PRIMARY KEY,
            game_id    TEXT NOT NULL,
            path       TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS save_states (
            id         TEXT PRIMARY KEY,
            game_id    TEXT NOT NULL,
            slot       TEXT NOT NULL,
            data       TEXT NOT NULL,
            thumb      TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_games_source ON games(source);
        CREATE INDEX IF NOT EXISTS idx_shots_game ON screenshots(game_id);
        CREATE INDEX IF NOT EXISTS idx_states_game ON save_states(game_id);
        "#,
    )
    .map_err(|e| format!("sqlite migrate failed: {e}"))?;

    // additive columns (safe re-runs): banner/logo art slots + genre tags
    for (table, col, def) in [
        ("games", "banner", "TEXT"),
        ("games", "logo", "TEXT"),
        ("games", "tags", "TEXT NOT NULL DEFAULT ''"),
    ] {
        let exists: bool = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get::<_, String>(1))
                    .map(|mut rows| rows.any(|name| name.as_deref() == Ok(col)))
            })
            .map_err(|e| e.to_string())?;
        if !exists {
            conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {col} {def};"))
                .map_err(|e| format!("sqlite alter failed: {e}"))?;
        }
    }
    Ok(())
}

fn to_sql(v: &Value) -> Box<dyn ToSql> {
    match v {
        Value::Null => Box::new(rusqlite::types::Null),
        Value::Bool(b) => Box::new(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else {
                Box::new(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => Box::new(s.clone()),
        other => Box::new(other.to_string()),
    }
}

#[tauri::command]
pub fn db_query(db: State<'_, AppState>, sql: String, params: Vec<Value>) -> Result<Vec<Value>, String> {
    let conn = db.db.lock().map_err(|_| "db lock poisoned")?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let cols = stmt.column_names();
    let col_names: Vec<String> = cols.iter().map(|s| s.to_string()).collect();
    let mut rows = stmt
        .query(params_from_iter(params.iter().map(to_sql)))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = serde_json::Map::new();
        for (i, name) in col_names.iter().enumerate() {
            let v: Value = match row.get_ref(i).map_err(|e| e.to_string())? {
                rusqlite::types::ValueRef::Null => Value::Null,
                rusqlite::types::ValueRef::Integer(n) => json!(n),
                rusqlite::types::ValueRef::Real(f) => json!(f),
                rusqlite::types::ValueRef::Text(t) => {
                    json!(String::from_utf8_lossy(t).to_string())
                }
                rusqlite::types::ValueRef::Blob(b) => json!(b.to_vec()),
            };
            obj.insert(name.clone(), v);
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}

#[tauri::command]
pub fn db_execute(
    db: State<'_, AppState>,
    sql: String,
    params: Vec<Value>,
) -> Result<Value, String> {
    let conn = db.db.lock().map_err(|_| "db lock poisoned")?;
    let affected = conn
        .execute(&sql, params_from_iter(params.iter().map(to_sql)))
        .map_err(|e| e.to_string())?;
    Ok(json!({ "rowsAffected": affected, "lastInsertId": conn.last_insert_rowid() }))
}

#[tauri::command]
pub fn app_paths(app: tauri::AppHandle) -> Value {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    json!({
        "base": base.to_string_lossy(),
        "art": base.join("art").to_string_lossy(),
        "saves": base.join("saves").to_string_lossy(),
        "screenshots": base.join("screenshots").to_string_lossy(),
        "clips": base.join("clips").to_string_lossy(),
        "cache": base.join("cache").to_string_lossy(),
        "db": base.join("meshplay.sqlite").to_string_lossy(),
    })
}
