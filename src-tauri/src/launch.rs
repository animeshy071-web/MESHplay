// Native PC game process lifecycle: spawn with custom arguments + working
// directory, supervise in the background, report exit, and allow a hard stop.
// The game keeps running if MESHplay is closed (detached on Windows).

use serde_json::json;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

/// Parses a launch-arguments string into a vector, honoring double quotes.
fn parse_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_q = false;
    let mut has = false;
    for c in s.chars() {
        match c {
            '"' => {
                in_q = !in_q;
                has = true;
            }
            ' ' | '\t' if !in_q => {
                if has || !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                    has = false;
                }
            }
            _ => cur.push(c),
        }
    }
    if has || !cur.is_empty() {
        out.push(cur);
    }
    out
}

#[tauri::command]
pub fn launch_native(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    args: Option<String>,
    work_dir: Option<String>,
) -> Result<u32, String> {
    let mut cmd = Command::new(&path);
    if let Some(a) = &args {
        for arg in parse_args(a) {
            cmd.arg(arg);
        }
    }
    let wd = match &work_dir {
        Some(w) if !w.is_empty() => std::path::PathBuf::from(w),
        _ => std::path::PathBuf::from(&path)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_default(),
    };
    if wd.is_dir() {
        cmd.current_dir(&wd);
    }
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP: no console flash, survives launcher exit
        cmd.creation_flags(0x0000_0008 | 0x0000_0200);
    }
    let mut child = cmd.spawn().map_err(|e| format!("launch failed: {e}"))?;
    let pid = child.id();

    // supervise: report exit + playtime end to the UI
    let app2 = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        let _ = app2.emit(
            "native-exited",
            json!({ "pid": pid, "code": code, "at": now_ms() }),
        );
    });

    state
        .children
        .lock()
        .map_err(|_| "children lock poisoned")?
        .insert(pid);
    Ok(pid)
}

#[tauri::command]
pub fn kill_native(state: State<'_, AppState>, pid: u32) -> Result<bool, String> {
    // The Child was moved into the supervisor thread, so stop by pid via taskkill
    // (only ever called for processes MESHplay itself launched).
    let was_ours = state
        .children
        .lock()
        .map_err(|_| "children lock poisoned")?
        .remove(&pid);
    if !was_ours {
        return Ok(false);
    }
    #[cfg(windows)]
    {
        let out = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F", "/T"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        Ok(out.map(|s| s.success()).unwrap_or(false))
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
