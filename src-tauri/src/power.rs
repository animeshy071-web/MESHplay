// Power & system: real Windows sleep (standby), hibernate, HDR settings panel
// launcher, and URL opening (Spotify auth, ViGEm guide, ms-settings pages).

use serde_json::{json, Value};

/// Put the PC into standby (S3) — the real "sleep timer" action.
#[tauri::command]
pub fn system_sleep() -> Value {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Power::SetSuspendState;
        // hibernate=false, force=false, wakeupdisabled=false
        let ok = SetSuspendState(0, 0, 0) != 0;
        json!({ "ok": ok })
    }
    #[cfg(not(windows))]
    json!({ "ok": false })
}

/// Hibernate (S4) — writes RAM to disk, full power off.
#[tauri::command]
pub fn system_hibernate() -> Value {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Power::SetSuspendState;
        let ok = SetSuspendState(1, 0, 0) != 0;
        json!({ "ok": ok })
    }
    #[cfg(not(windows))]
    json!({ "ok": false })
}

/// Open a URL or ms-settings page in the user's default browser.
/// Used for: Spotify account link, ViGEm driver guide, Windows HDR panel.
#[tauri::command]
pub fn open_url(url: String) -> Value {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let wide: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
        let verb: Vec<u16> = "open\0".encode_utf16().collect();
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL as i32,
            )
        };
        json!({ "ok": (result as isize) > 32 })
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        json!({ "ok": false })
    }
}

/// ViGEm virtual-controller bridge status: is the ViGEmBus driver installed?
/// (checked via the driver service registry key — no admin needed to look)
#[tauri::command]
pub fn vigem_status() -> Value {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Registry::{
            RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD,
        };
        let path: Vec<u16> = "SYSTEM\\CurrentControlSet\\Services\\ViGEmBus\0"
            .encode_utf16()
            .collect();
        let name: Vec<u16> = "Start\0".encode_utf16().collect();
        let mut value: u32 = 0;
        let mut size: u32 = std::mem::size_of::<u32>() as u32;
        let ok = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                path.as_ptr(),
                name.as_ptr(),
                RRF_RT_REG_DWORD,
                std::ptr::null_mut(),
                &mut value as *mut u32 as *mut _,
                &mut size,
            )
        };
        json!({ "installed": ok == 0, "start": if ok == 0 { Some(value) } else { None } })
    }
    #[cfg(not(windows))]
    json!({ "installed": false, "start": null })
}
