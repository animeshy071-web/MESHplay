// OS-level input for the phone trackpad / mouse mode: SendInput-based mouse
// movement and clicks, plus volume-key injection for the Game Bar mini mixer
// (real Windows master volume, no audio API needed).

use serde_json::{json, Value};

fn send_mouse(flags: u32, dx: i32, dy: i32) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEINPUT,
        };
        let mut input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx,
                    dy,
                    mouseData: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let sent = SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32);
        sent == 1
    }
    #[cfg(not(windows))]
    {
        let _ = (flags, dx, dy);
        false
    }
}

const MOUSEEVENTF_MOVE: u32 = 0x0001;
const MOUSEEVENTF_LEFTDOWN: u32 = 0x0002;
const MOUSEEVENTF_LEFTUP: u32 = 0x0004;
const MOUSEEVENTF_RIGHTDOWN: u32 = 0x0008;
const MOUSEEVENTF_RIGHTUP: u32 = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN: u32 = 0x0020;
const MOUSEEVENTF_MIDDLEUP: u32 = 0x0040;

#[tauri::command]
pub fn send_mouse_move(dx: i32, dy: i32) -> Value {
    json!({ "ok": send_mouse(MOUSEEVENTF_MOVE, dx, dy) })
}

#[tauri::command]
pub fn send_mouse_click(button: String) -> Value {
    let (down, up) = match button.as_str() {
        "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    };
    let a = send_mouse(down, 0, 0);
    let b = send_mouse(up, 0, 0);
    json!({ "ok": a && b })
}

fn send_vk(vk: u16) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
        };
        let press = |flags: KEYBD_EVENT_FLAGS| {
            let mut input = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk,
                        wScan: 0,
                        dwFlags: flags,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            SendInput(1, &mut input, std::mem::size_of::<INPUT>() as i32) == 1
        };
        press(0) && press(2) // KEYEVENTF_KEYUP = 2
    }
    #[cfg(not(windows))]
    {
        let _ = vk;
        false
    }
}

#[tauri::command]
pub fn send_volume_key(key: String) -> Value {
    let vk: u16 = match key.as_str() {
        "mute" => 0xAD,
        "down" => 0xAE,
        _ => 0xAF, // up
    };
    json!({ "ok": send_vk(vk) })
}
