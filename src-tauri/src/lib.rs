// MESHplay native backend — everything the OS shell needs from Windows:
// SQLite persistence, PE game identification, Steam library detection, ROM
// scanning, native game launching/supervision, live system stats, storage ops,
// display control, companion window, and OS-level mouse/volume input.
//
// 100% offline: no HTTP clients, no telemetry, no accounts.

mod db;
mod display;
mod fsops;
mod launch;
mod lnk;
mod mouse;
mod pe;
mod roms;
mod steam;
mod stats;

use rusqlite::Connection;
use std::collections::HashSet;
use std::sync::Mutex;
use sysinfo::System;

use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub sys: Mutex<System>,
    pub last_stats: Mutex<stats::StatsCache>,
    pub children: Mutex<HashSet<u32>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // second launch attempt: focus the existing console window
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let _ = std::fs::create_dir_all(data_dir.join("art"));
            let _ = std::fs::create_dir_all(data_dir.join("saves"));
            let _ = std::fs::create_dir_all(data_dir.join("screenshots"));
            let _ = std::fs::create_dir_all(data_dir.join("clips"));
            let _ = std::fs::create_dir_all(data_dir.join("cache"));
            let conn = db::open(&data_dir.join("meshplay.sqlite"))?;
            db::migrate(&conn)?;
            app.manage(AppState {
                db: Mutex::new(conn),
                sys: Mutex::new(System::new()),
                last_stats: Mutex::new(stats::StatsCache::default()),
                children: Mutex::new(HashSet::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_query,
            db::db_execute,
            db::app_paths,
            pe::pick_game_file,
            pe::pick_image_file,
            pe::identify_exe,
            pe::read_art,
            lnk::resolve_shortcut,
            steam::scan_steam,
            roms::scan_roms,
            roms::pick_rom_folder,
            roms::read_rom_bytes,
            launch::launch_native,
            launch::kill_native,
            stats::system_stats,
            stats::controller_battery,
            fsops::storage_breakdown,
            fsops::delete_to_recycle_bin,
            fsops::clear_cache,
            fsops::write_screenshot,
            fsops::write_clip,
            fsops::export_saves,
            fsops::import_saves,
            fsops::pick_export_file,
            fsops::pick_import_file,
            display::list_monitors,
            display::set_display_mode,
            display::focus_main_window,
            display::open_companion,
            display::close_companion,
            mouse::send_mouse_move,
            mouse::send_mouse_click,
            mouse::send_volume_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MESHplay");
}
