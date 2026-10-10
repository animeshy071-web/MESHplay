// Display control: monitor enumeration, fullscreen / borderless-windowed /
// windowed switching, and main-window focus. Uses Tauri's own window APIs.

use serde_json::{json, Value};
use tauri::Manager;

#[tauri::command]
pub fn list_monitors(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    let monitors = app
        .available_monitors()
        .map_err(|e| format!("monitor enum failed: {e}"))?;
    let primary = app
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().map(|n| n.to_string()));
    let current = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .and_then(|m| m.name().map(|n| n.to_string()));
    let out = monitors
        .into_iter()
        .map(|m| {
            let pos = m.position();
            let size = m.size();
            let name = m.name().map(|s| s.as_str()).unwrap_or("");
            json!({
                "name": name,
                "width": size.width,
                "height": size.height,
                "x": pos.x,
                "y": pos.y,
                "scaleFactor": m.scale_factor(),
                "isPrimary": primary.as_deref() == Some(name),
                "isCurrent": current.as_deref() == Some(name),
            })
        })
        .collect();
    Ok(out)
}

#[tauri::command]
pub fn set_display_mode(
    app: tauri::AppHandle,
    mode: String,
    monitor: Option<String>,
) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    match mode.as_str() {
        "fullscreen" => {
            let _ = win.set_fullscreen(true);
            let _ = win.set_decorations(false);
        }
        "borderless" => {
            let _ = win.set_fullscreen(false);
            let _ = win.set_decorations(false);
            let _ = win.maximize();
        }
        "windowed" => {
            let _ = win.set_fullscreen(false);
            let _ = win.set_decorations(true);
            let _ = win.unmaximize();
        }
        _ => return Err(format!("unknown display mode: {mode}")),
    }
    if let Some(target) = monitor {
        if let Ok(monitors) = app.available_monitors() {
            if let Some(m) = monitors.iter().find(|m| m.name() == Some(&target)) {
                let _ = win.set_position(*m.position());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn focus_main_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_focus();
    }
}

/// Open (or focus) the floating companion stats widget for native games.
#[tauri::command]
pub fn open_companion(app: tauri::AppHandle, title: String) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    if let Some(existing) = app.get_webview_window("companion") {
        let _ = existing.set_title(&format!("MESHplay — {title}"));
        let _ = existing.set_focus();
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(
        &app,
        "companion",
        WebviewUrl::App("companion.html".into()),
    )
    .title(format!("MESHplay — {title}"))
    .inner_size(360.0, 96.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .transparent(true)
    .shadow(false)
    .build()
    .map_err(|e| format!("companion window failed: {e}"))?;
    let _ = win.set_position(tauri::PhysicalPosition::new(24.0_f64, 24.0_f64));
    Ok(())
}

#[tauri::command]
pub fn close_companion(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("companion") {
        let _ = win.close();
    }
}
