// Real-time system stats for the Game Bar performance monitor: CPU %, RAM,
// battery (charging state), GPU name + utilization. CPU/RAM via sysinfo,
// battery via Win32 GetSystemPowerStatus, GPU name from the display-class
// registry, GPU % via PDH "GPU Engine" counters. Every probe degrades to
// None gracefully — the widget just hides a row.

use serde::Serialize;
use std::time::Instant;
use tauri::State;

use crate::AppState;

pub const MIN_CPU_INTERVAL: std::time::Duration = std::time::Duration::from_millis(220);

#[derive(Default)]
pub struct StatsCache {
    pub last_refresh: Option<Instant>,
    pub last_cpu: f32,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct SystemStats {
    pub cpu_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
    pub battery_percent: Option<f32>,
    pub charging: Option<bool>,
    pub gpu_name: Option<String>,
    pub gpu_percent: Option<f32>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ControllerBattery {
    pub index: u32,
    pub kind: String,   // "gamepad" | "headset"
    pub level: String,  // "empty" | "low" | "medium" | "full" | "unknown"
    pub percent: f32,
}

#[tauri::command]
pub fn system_stats(state: State<'_, AppState>) -> SystemStats {
    let mut out = SystemStats::default();

    // ---- CPU + RAM (sysinfo, respecting the minimum refresh interval) ----
    {
        let mut sys = state.sys.lock().unwrap_or_else(|e| e.into_inner());
        let refresh_ok = {
            let mut cache = state.last_stats.lock().unwrap_or_else(|e| e.into_inner());
            let elapsed = cache.last_refresh.map(|t| t.elapsed()).unwrap_or(MIN_CPU_INTERVAL);
            if elapsed >= MIN_CPU_INTERVAL {
                sys.refresh_cpu_usage();
                sys.refresh_memory();
                cache.last_refresh = Some(Instant::now());
                true
            } else {
                false
            }
        };
        if refresh_ok {
            let mut cache = state.last_stats.lock().unwrap_or_else(|e| e.into_inner());
            cache.last_cpu = sys.global_cpu_usage();
        }
        let cache = state.last_stats.lock().unwrap_or_else(|e| e.into_inner());
        out.cpu_percent = cache.last_cpu.clamp(0.0, 100.0);
        out.ram_used_gb = (sys.used_memory() as f64 / 1024.0 / 1024.0 / 1024.0) as f32;
        out.ram_total_gb = (sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0) as f32;
    }

    // ---- battery (Win32) ----
    if let Some((pct, ac)) = battery_status() {
        out.battery_percent = Some(pct);
        out.charging = Some(ac);
    }

    // ---- GPU name + utilization ----
    if out.gpu_name.is_none() {
        out.gpu_name = gpu_name();
    }
    out.gpu_percent = gpu_utilization();

    out
}

fn battery_status() -> Option<(f32, bool)> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        let mut sps: SYSTEM_POWER_STATUS = std::mem::zeroed();
        if GetSystemPowerStatus(&mut sps) != 0 {
            // BatteryFlag 128 = no system battery
            if sps.BatteryFlag & 128 == 0 && sps.BatteryLifePercent != 255 {
                return Some((sps.BatteryLifePercent as f32, sps.ACLineStatus == 1));
            }
            return None;
        }
    }
    None
}

fn gpu_name() -> Option<String> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
        let class = "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}";
        for sub in ["0000", "0001", "0002"] {
            let subkey: Vec<u16> = format!("{class}\\{sub}\0").encode_utf16().collect();
            let value: Vec<u16> = "DriverDesc\0".encode_utf16().collect();
            let mut buf = [0u16; 512];
            let mut size: u32 = (buf.len() * 2) as u32;
            let status = RegGetValueW(
                HKEY_LOCAL_MACHINE,
                subkey.as_ptr(),
                value.as_ptr(),
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                buf.as_mut_ptr() as *mut core::ffi::c_void,
                &mut size,
            );
            if status == 0 {
                let end = buf.iter().position(|&w| w == 0).unwrap_or(0);
                let name = String::from_utf16_lossy(&buf[..end]);
                if !name.is_empty() {
                    return Some(name);
                }
            }
        }
    }
    None
}

fn gpu_utilization() -> Option<f32> {
    #[cfg(windows)]
    {
        use std::sync::Mutex;
        use std::time::Instant;
        static CACHE: Mutex<Option<(Instant, f32)>> = Mutex::new(None);
        {
            let cache = CACHE.lock().ok()?;
            if let Some((t, v)) = *cache {
                if t.elapsed() < std::time::Duration::from_millis(700) {
                    return Some(v);
                }
            }
        }
        let v = pdh_gpu_util()?;
        if let Ok(mut cache) = CACHE.lock() {
            *cache = Some((Instant::now(), v));
        }
        Some(v)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Sums the 3D-engine utilization across all GPU Engine PDH instances.
/// Pattern: open query → prime sample → settle → resample → formatted array.
#[cfg(windows)]
fn pdh_gpu_util() -> Option<f32> {
    use windows_sys::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
        PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE,
    };
    unsafe {
        let mut query: isize = 0;
        if PdhOpenQueryW(std::ptr::null(), 0, &mut query) != 0 {
            return None;
        }
        let path: Vec<u16> = "\\GPU Engine(*)\\Utilization Percentage\0".encode_utf16().collect();
        let mut counter: isize = 0;
        if PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) != 0 {
            PdhCloseQuery(query);
            return None;
        }
        // prime the counter, wait a beat, sample again so the delta window is valid
        if PdhCollectQueryData(query) != 0 {
            PdhCloseQuery(query);
            return None;
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
        if PdhCollectQueryData(query) != 0 {
            PdhCloseQuery(query);
            return None;
        }
        // size the buffer
        let mut size: u32 = 0;
        let mut count: u32 = 0;
        let _ = PdhGetFormattedCounterArrayW(
            counter, PDH_FMT_DOUBLE, &mut size, &mut count, std::ptr::null_mut(),
        );
        if size == 0 {
            PdhCloseQuery(query);
            return None;
        }
        let mut buf = vec![0u8; size as usize];
        let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        let status = PdhGetFormattedCounterArrayW(
            counter, PDH_FMT_DOUBLE, &mut size, &mut count, items,
        );
        let mut total = 0f64;
        if status == 0 {
            for i in 0..count as usize {
                let item = &*items.add(i);
                // instance name looks like: pid_1234_luid_..._eng_0_engtype_3D
                let mut p = item.szName;
                let mut len = 0usize;
                while *p != 0 {
                    len += 1;
                    p = p.add(1);
                }
                let name = String::from_utf16_lossy(std::slice::from_raw_parts(item.szName, len));
                if !name.contains("engtype_3D") {
                    continue;
                }
                let v = item.FmtValue.Anonymous.doubleValue;
                if v.is_finite() && v > 0.0 {
                    total += v;
                }
            }
        }
        PdhCloseQuery(query);
        if total > 0.0 {
            Some((total.min(100.0)) as f32)
        } else {
            None
        }
    }
}

/// XInput controller battery levels for the Game Bar controller-health gauge.
#[tauri::command]
pub fn controller_battery() -> Vec<ControllerBattery> {
    let mut out = Vec::new();
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::Input::XboxController::{
            XInputGetBatteryInformation, BATTERY_DEVTYPE_GAMEPAD,
        };
        for idx in 0..4u32 {
            let mut info = windows_sys::Win32::UI::Input::XboxController::XINPUT_BATTERY_INFORMATION {
                BatteryType: 0,
                BatteryLevel: 0,
            };
            let status = XInputGetBatteryInformation(idx, BATTERY_DEVTYPE_GAMEPAD, &mut info);
            if status == 0 && info.BatteryType != 0 {
                let level = match info.BatteryLevel {
                    0 => "empty",
                    1 => "low",
                    2 => "medium",
                    3 => "full",
                    _ => "unknown",
                };
                out.push(ControllerBattery {
                    index: idx,
                    kind: "gamepad".into(),
                    level: level.into(),
                    percent: match info.BatteryLevel {
                        0 => 0.0,
                        1 => 25.0,
                        2 => 60.0,
                        3 => 100.0,
                        _ => 0.0,
                    },
                });
            }
        }
    }
    out
}
