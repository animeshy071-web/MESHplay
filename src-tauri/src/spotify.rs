// Spotify Connect — OAuth 2.0 PKCE callback catcher. The webview builds the
// authorize URL (PKCE verifier stays in JS), opens the user's browser via
// open_url, and Spotify redirects here. We capture the code, show a friendly
// page, and the webview polls spotify_poll to finish the token exchange with
// its own fetch (no HTTP client in Rust — 100% local listener only).

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

use crate::AppState;

pub struct SpotifyAuth {
    pub code: Arc<Mutex<Option<String>>>,
    pub port: u16,
    stop: Arc<std::sync::atomic::AtomicBool>,
}

const SUCCESS_PAGE: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>MESHplay — Spotify connected</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0714;color:#fff;display:grid;place-items:center;height:100vh;margin:0}
.c{text-align:center}.b{width:64px;height:64px;border-radius:50%;background:#1db954;display:grid;place-items:center;margin:0 auto 18px;font-size:32px}
h1{font-size:20px}p{color:rgba(255,255,255,.55);font-size:14px}</style></head>
<body><div class="c"><div class="b">✓</div><h1>Spotify connected to MESHplay</h1><p>You can close this tab and return to the console.</p></div></body></html>"#;

fn serve_auth(mut stream: TcpStream, code_slot: Arc<Mutex<Option<String>>>) {
    let mut buf = Vec::with_capacity(1024);
    let mut byte = [0u8; 1];
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    while buf.len() < 8 * 1024 {
        match stream.read(&mut byte) {
            Ok(1) => {
                buf.push(byte[0]);
                if buf.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            _ => break,
        }
    }
    let head = String::from_utf8_lossy(&buf).into_owned();
    if let Some(line) = head.lines().next() {
        let path = line.split_whitespace().nth(1).unwrap_or("/");
        if let Some(rest) = path.strip_prefix("/callback?") {
            for kv in rest.split('&') {
                if let Some((k, v)) = kv.split_once('=') {
                    if k == "code" {
                        *code_slot.lock().unwrap() = Some(v.to_string());
                    }
                }
            }
        }
    }
    let body = SUCCESS_PAGE.as_bytes();
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn start_listener() -> Result<SpotifyAuth, String> {
    let code_slot = Arc::new(Mutex::new(None));
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));

    let mut bound: Option<(TcpListener, u16)> = None;
    // 8899 first, then walk down
    for p in [8899u16, 8898, 8897, 8896, 8895, 8894, 8893, 8892, 8891, 8890] {
        match TcpListener::bind(("127.0.0.1", p)) {
            Ok(l) => {
                bound = Some((l, p));
                break;
            }
            Err(_) => continue,
        }
    }
    let (listener, port) = bound.ok_or("no free Spotify callback port")?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let slot = code_slot.clone();
    let stop_th = stop.clone();
    std::thread::Builder::new()
        .name("meshplay-spotify".into())
        .spawn(move || loop {
            if stop_th.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }
            match listener.accept() {
                Ok((stream, _)) => {
                    let slot = slot.clone();
                    let _ = std::thread::Builder::new()
                        .name("meshplay-spotify-cb".into())
                        .spawn(move || serve_auth(stream, slot));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(_) => break,
            }
        })
        .map_err(|e| format!("thread spawn failed: {e}"))?;

    Ok(SpotifyAuth { code: code_slot, port, stop })
}

/// Begin (or re-arm) the auth listener. Returns the callback port to build the
/// redirect_uri from.
#[tauri::command]
pub fn spotify_begin(state: State<'_, AppState>) -> Result<Value, String> {
    let mut guard = state.spotify.lock().map_err(|_| "spotify lock poisoned")?;
    match guard.as_ref() {
        Some(s) => {
            // re-arm: clear any stale code
            *s.code.lock().unwrap() = None;
            Ok(json!({ "ok": true, "port": s.port }))
        }
        None => {
            let auth = start_listener()?;
            let port = auth.port;
            *guard = Some(auth);
            Ok(json!({ "ok": true, "port": port }))
        }
    }
}

/// Poll for the captured OAuth code (returns it once, then clears).
#[tauri::command]
pub fn spotify_poll(state: State<'_, AppState>) -> Value {
    let guard = state.spotify.lock().ok();
    let Some(g) = guard else { return json!({ "ok": false }) };
    let Some(auth) = g.as_ref() else { return json!({ "ok": false }) };
    let mut code = auth.code.lock().unwrap();
    match code.take() {
        Some(c) => json!({ "ok": true, "code": c }),
        None => json!({ "ok": true, "code": null }),
    }
}

#[tauri::command]
pub fn spotify_cancel(state: State<'_, AppState>) -> Value {
    let mut guard = state.spotify.lock().ok();
    if let Some(g) = guard.as_mut() {
        if let Some(s) = g.take() {
            s.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
    json!({ "ok": true })
}
