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

// ---------- keyboard injection for the universal remap layer ----------
// Maps JS KeyboardEvent.code → Windows VK codes so gamepad/phone/wheel input
// can drive real PC games (which never see DOM events).

fn vk_from_code(code: &str) -> Option<(u16, bool)> {
    // (vk, needs KEYEVENTF_EXTENDEDKEY)
    let vk = match code {
        "Enter" => 0x0D, "Escape" => 0x1B, "Space" => 0x20, "Tab" => 0x09,
        "Backspace" => 0x08, "Backquote" => 0xC0, "Minus" => 0xBD, "Equal" => 0xBB,
        "BracketLeft" => 0xDB, "BracketRight" => 0xDD, "Semicolon" => 0xBA, "Quote" => 0xDE,
        "Comma" => 0xBC, "Period" => 0xBE, "Slash" => 0xBF, "Backslash" => 0xDC,
        "ShiftLeft" => 0xA0, "ShiftRight" => 0xA1,
        "ControlLeft" => 0xA2, "ControlRight" => 0xA3,
        "AltLeft" => 0xA4, "AltRight" => 0xA5,
        "MetaLeft" => 0x5B, "MetaRight" => 0x5C,
        "PageUp" => 0x21, "PageDown" => 0x22, "Home" => 0x24, "End" => 0x23,
        "Insert" => 0x2D, "Delete" => 0x2E, "CapsLock" => 0x14, "NumLock" => 0x90,
        "ScrollLock" => 0x91, "Pause" => 0x13, "PrintScreen" => 0x2C,
        "ContextMenu" => 0x5D,
        "ArrowUp" => 0x26, "ArrowDown" => 0x28, "ArrowLeft" => 0x25, "ArrowRight" => 0x27,
        c if c.starts_with("Key") && c.len() == 4 => {
            let ch = c.as_bytes()[3];
            if ch.is_ascii_uppercase() { ch as u16 } else { return None }
        }
        c if c.starts_with("Digit") && c.len() == 6 => {
            let ch = c.as_bytes()[5];
            if ch.is_ascii_digit() { ch as u16 } else { return None }
        }
        c if c.starts_with("Numpad") => match c {
            "Numpad0" => 0x60, "Numpad1" => 0x61, "Numpad2" => 0x62, "Numpad3" => 0x63,
            "Numpad4" => 0x64, "Numpad5" => 0x65, "Numpad6" => 0x66, "Numpad7" => 0x67,
            "Numpad8" => 0x68, "Numpad9" => 0x69,
            "NumpadAdd" => 0x6B, "NumpadSubtract" => 0x6D, "NumpadMultiply" => 0x6A,
            "NumpadDivide" => 0x6F, "NumpadDecimal" => 0x6E, "NumpadEnter" => 0x0D,
            _ => return None,
        },
        c if c.starts_with('F') => {
            let n: u32 = c[1..].parse().ok()?;
            if (1..=24).contains(&n) { 0x70 + (n - 1) as u16 } else { return None }
        }
        _ => return None,
    };
    // extended keys must carry KEYEVENTF_EXTENDEDKEY to land in games correctly
    let extended = matches!(
        code,
        "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
            | "Insert" | "Delete" | "Home" | "End" | "PageUp" | "PageDown"
            | "ControlRight" | "AltRight" | "MetaLeft" | "MetaRight" | "PrintScreen"
    );
    Some((vk, extended))
}

fn send_key_vk(vk: u16, down: bool, extended: bool) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
            KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
        };
        let mut flags: u32 = 0;
        if extended {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        if !down {
            flags |= KEYEVENTF_KEYUP;
        }
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
    }
    #[cfg(not(windows))]
    {
        let _ = (vk, down, extended);
        false
    }
}

/// Inject a key down/up into the OS — the bridge for controller→keyboard
/// remapping while a native PC game is running.
#[tauri::command]
pub fn send_key(code: String, down: bool) -> Value {
    match vk_from_code(&code) {
        Some((vk, extended)) => json!({ "ok": send_key_vk(vk, down, extended) }),
        None => json!({ "ok": false, "error": "unsupported code" }),
    }
}
