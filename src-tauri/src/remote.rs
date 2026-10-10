// LAN Remote Play server embedded in the desktop app. Serves the phone
// controller PWA (bundled into the binary) and relays WebSocket input from
// paired phones to the host webview — the same protocol as the dev server in
// `scripts/remote-server.mjs`, so `npm run dev` and the packaged .exe behave
// identically. 100% offline: traffic never leaves the home network.

use include_dir::{include_dir, Dir};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use tungstenite::{Message, WebSocket};

use crate::AppState;

static ASSETS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../public/remote");

// ---------- shared hub ----------

struct Hub {
    host: Option<u64>,
    /// conn id -> player number (1..=4)
    phones: HashMap<u64, u8>,
    slots: [bool; 4],
    senders: HashMap<u64, mpsc::Sender<Message>>,
}

impl Hub {
    fn new() -> Self {
        Self { host: None, phones: HashMap::new(), slots: [false; 4], senders: HashMap::new() }
    }
}

type Shared = Arc<Mutex<Hub>>;

fn broadcast_players(shared: &Shared) {
    let hub = shared.lock().unwrap();
    if let Some(host) = hub.host.and_then(|h| hub.senders.get(&h)) {
        let mut list: Vec<u8> = hub.phones.values().copied().collect();
        list.sort_unstable();
        let _ = host.send(Message::Text(json!({ "type": "players", "players": list }).to_string()));
    }
}

fn relay_text(shared: &Shared, is_host: bool, text: &str) {
    let hub = shared.lock().unwrap();
    if is_host {
        // host -> phones: rumble / find-my-controller pings
        if let Ok(msg) = serde_json::from_str::<Value>(text) {
            if msg.get("type").and_then(|t| t.as_str()) == Some("rumble") {
                for (id, sender) in &hub.senders {
                    if hub.phones.contains_key(id) {
                        let _ = sender.send(Message::Text(text.to_string()));
                    }
                }
            }
        }
        return;
    }
    // phone -> host: input / axes / mouse / click / gyro
    if let Some(host) = hub.host.and_then(|h| hub.senders.get(&h)) {
        let _ = host.send(Message::Text(text.to_string()));
    }
}

// ---------- stream that replays the consumed HTTP head, then reads live ----------
// tungstenite::accept() needs to read the upgrade request itself; we already
// consumed the head byte-wise to route the connection. Replay it transparently.

struct ReplayStream {
    pre: Vec<u8>,
    pos: usize,
    inner: TcpStream,
}

impl Read for ReplayStream {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.pos < self.pre.len() {
            let n = (self.pre.len() - self.pos).min(buf.len());
            buf[..n].copy_from_slice(&self.pre[self.pos..self.pos + n]);
            self.pos += n;
            return Ok(n);
        }
        self.inner.read(buf)
    }
}

impl Write for ReplayStream {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.inner.write(buf)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

// ---------- per-connection WS thread ----------

fn ws_thread(
    mut ws: WebSocket<ReplayStream>,
    shared: Shared,
    is_host: bool,
    player: u8,
    conn_id: u64,
    rx: mpsc::Receiver<Message>,
) {
    // register
    {
        let mut hub = shared.lock().unwrap();
        if is_host {
            hub.host = Some(conn_id);
        } else {
            hub.phones.insert(conn_id, player);
        }
    }
    let _ = ws.send(Message::Text(
        json!({ "type": "welcome", "role": if is_host { "host" } else { "phone" }, "player": player }).to_string(),
    ));
    let _ = ws.flush();
    broadcast_players(&shared);

    loop {
        match ws.read() {
            Ok(Message::Text(t)) => relay_text(&shared, is_host, &t),
            Ok(Message::Close(_)) => break,
            Ok(_) => {} // ping (auto-ponged) / pong / binary / frame — keep alive
            Err(tungstenite::Error::Io(ref e)) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }
        let mut open = true;
        while let Ok(m) = rx.try_recv() {
            if ws.send(m).is_err() {
                open = false;
                break;
            }
        }
        if !open || ws.flush().is_err() {
            break;
        }
    }

    // unregister
    {
        let mut hub = shared.lock().unwrap();
        hub.senders.remove(&conn_id);
        if is_host {
            if hub.host == Some(conn_id) {
                hub.host = None;
            }
        } else if let Some(p) = hub.phones.remove(&conn_id) {
            let idx = (p as usize).saturating_sub(1).min(3);
            hub.slots[idx] = false;
        }
    }
    broadcast_players(&shared);
}

// ---------- token / ip ----------

fn gen_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E37_79B9_7F4A_7C15);
    let mut x = nanos ^ (std::process::id() as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    for _ in 0..4 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
    }
    format!("{:08x}", (x & 0xFFFF_FFFF) as u32)
}

fn lan_ip() -> String {
    // UDP "connect" only picks the default-route interface — no packets sent.
    if let Ok(s) = UdpSocket::bind("0.0.0.0:0") {
        for dest in ["8.8.8.8:80", "192.168.255.255:9", "10.255.255.255:9"] {
            if s.connect(dest).is_ok() {
                if let Ok(addr) = s.local_addr() {
                    if !addr.ip().is_loopback() {
                        return addr.ip().to_string();
                    }
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

// ---------- embedded PWA over plain HTTP ----------

fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "webmanifest" | "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn http_response(status: &str, ctype: &str, body: &[u8], extra: &str) -> Vec<u8> {
    let mut out = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n\r\n",
        body.len()
    )
    .into_bytes();
    out.extend_from_slice(body);
    out
}

/// Read an HTTP request head byte-by-byte (heads are tiny; no over-read risk
/// before a WebSocket upgrade).
fn read_head(stream: &mut TcpStream) -> Option<Vec<u8>> {
    let mut buf = Vec::with_capacity(1024);
    let mut byte = [0u8; 1];
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .ok();
    while buf.len() < 16 * 1024 {
        match stream.read(&mut byte) {
            Ok(1) => {
                buf.push(byte[0]);
                if buf.ends_with(b"\r\n\r\n") {
                    return Some(buf);
                }
            }
            _ => {
                return if buf.is_empty() { None } else { Some(buf) };
            }
        }
    }
    None
}

/// Reject a WebSocket *after* completing the handshake so the browser sees the
/// proper close code (4001 bad token / 4002 slots full) — same as dev server.
fn ws_reject(stream: TcpStream, head: Vec<u8>, code: u16, reason: &str) {
    let replay = ReplayStream { pre: head, pos: 0, inner: stream };
    let mut ws = match tungstenite::accept(replay) {
        Ok(ws) => ws,
        Err(_) => return,
    };
    let _ = ws.send(Message::Close(Some(tungstenite::protocol::CloseFrame {
        code: code.into(),
        reason: reason.to_owned().into(),
    })));
    let _ = ws.flush();
    let _ = ws.close(None);
}

static CONN_SEQ: AtomicU64 = AtomicU64::new(1);

fn serve_conn(mut stream: TcpStream, shared: Shared, token: String, port: u16, ip: String) {
    let Some(head) = read_head(&mut stream) else { return };
    let head_str = String::from_utf8_lossy(&head).into_owned();
    let Some(line) = head_str.lines().next() else { return };
    let full_path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
    let (path, query) = match full_path.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (full_path.clone(), String::new()),
    };

    // --- WebSocket endpoint ---
    if path == "/ws" {
        let mut role = String::new();
        let mut tok = String::new();
        for kv in query.split('&') {
            if let Some((k, v)) = kv.split_once('=') {
                match k {
                    "role" => role = v.to_string(),
                    "t" => tok = v.to_string(),
                    _ => {}
                }
            }
        }
        let remote = stream.peer_addr().map(|a| a.ip().to_string()).unwrap_or_default();
        let is_local = remote == "127.0.0.1" || remote == "::1";

        if role == "host" && !is_local {
            ws_reject(stream, head, 4003, "host must connect from this PC");
            return;
        }
        if role != "host" && tok != token {
            ws_reject(stream, head, 4001, "bad token");
            return;
        }

        // claim a player slot (phones) before the handshake so slots stay honest
        let mut player = 0u8;
        if role != "host" {
            let mut hub = shared.lock().unwrap();
            let Some(slot) = hub.slots.iter().position(|taken| !taken) else {
                ws_reject(stream, head, 4002, "all player slots taken");
                return;
            };
            hub.slots[slot] = true;
            player = (slot + 1) as u8;
        }

        // 5ms read timeout => ~5-15ms relay latency without busy-spinning cores
        let _ = stream.set_read_timeout(Some(Duration::from_millis(5)));
        let replay = ReplayStream { pre: head, pos: 0, inner: stream };
        let ws = match tungstenite::accept(replay) {
            Ok(ws) => ws,
            Err(_) => {
                // undo slot claim on failed handshake
                if role != "host" {
                    let mut hub = shared.lock().unwrap();
                    let idx = (player as usize).saturating_sub(1).min(3);
                    hub.slots[idx] = false;
                }
                return;
            }
        };

        let (tx, rx) = mpsc::channel::<Message>();
        let conn_id = CONN_SEQ.fetch_add(1, Ordering::Relaxed);
        {
            let mut hub = shared.lock().unwrap();
            hub.senders.insert(conn_id, tx);
        }
        let _ = std::thread::Builder::new()
            .name(if role == "host" { "meshplay-ws-host".into() } else { format!("meshplay-ws-p{player}") })
            .spawn(move || ws_thread(ws, shared, role == "host", player, conn_id, rx));
        return;
    }

    // --- plain HTTP ---
    let no_store = "Cache-Control: no-store\r\n";
    let no_store_cors = "Cache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\n";
    match path.as_str() {
        "/info" => {
            let body = json!({
                "ok": true, "token": token, "ip": ip, "port": port,
                "url": format!("http://{ip}:{port}/?t={token}"),
            })
            .to_string()
            .into_bytes();
            let _ = stream.write_all(&http_response("200 OK", "application/json; charset=utf-8", &body, no_store_cors));
        }
        _ => {
            let rel = match path.as_str() {
                "/" | "/index.html" | "/remote" => "index.html",
                p => p.trim_start_matches('/'),
            };
            match ASSETS.get_file(rel) {
                Some(file) => {
                    let extra = if rel == "icons/pwa-192.png" || rel.starts_with("icons/") {
                        "Cache-Control: max-age=3600\r\n"
                    } else {
                        no_store
                    };
                    let _ = stream.write_all(&http_response("200 OK", mime_for(rel), file.contents(), extra));
                }
                None => {
                    let _ = stream.write_all(&http_response("404 Not Found", "application/json", b"{\"ok\":false}", ""));
                }
            }
        }
    }
    let _ = stream.flush();
}

// ---------- server handle ----------

pub struct RemoteServer {
    pub port: u16,
    pub token: String,
    pub ip: String,
    stop: Arc<AtomicBool>,
    alive: Arc<AtomicBool>,
}

impl RemoteServer {
    pub fn info(&self) -> Value {
        json!({
            "ok": true,
            "running": self.alive.load(Ordering::Relaxed),
            "port": self.port,
            "token": self.token,
            "ip": self.ip,
            "url": format!("http://{}:{}/?t={}", self.ip, self.port, self.token),
        })
    }
}

fn start_server() -> Result<RemoteServer, String> {
    let token = gen_token();
    let ip = lan_ip();

    // pick a free port: 8765..8775
    let mut listener: Option<TcpListener> = None;
    let mut port = 8765u16;
    for p in 8765..=8775 {
        match TcpListener::bind(("0.0.0.0", p)) {
            Ok(l) => {
                listener = Some(l);
                port = p;
                break;
            }
            Err(_) => continue,
        }
    }
    let listener = listener.ok_or("no free port in 8765..8775")?;

    let shared: Shared = Arc::new(Mutex::new(Hub::new()));
    let stop = Arc::new(AtomicBool::new(false));
    let alive = Arc::new(AtomicBool::new(true));

    listener
        .set_nonblocking(true)
        .map_err(|e| format!("listener setup failed: {e}"))?;

    let shared_th = shared.clone();
    let stop_th = stop.clone();
    let alive_th = alive.clone();
    let token_th = token.clone();
    let ip_th = ip.clone();

    std::thread::Builder::new()
        .name("meshplay-remote".into())
        .spawn(move || {
            loop {
                if stop_th.load(Ordering::Relaxed) {
                    break;
                }
                match listener.accept() {
                    Ok((stream, _)) => {
                        let shared = shared_th.clone();
                        let token = token_th.clone();
                        let ip = ip_th.clone();
                        let _ = std::thread::Builder::new()
                            .name("meshplay-conn".into())
                            .spawn(move || serve_conn(stream, shared, token, port, ip));
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(60));
                    }
                    Err(_) => break,
                }
            }
            alive_th.store(false, Ordering::Relaxed);
        })
        .map_err(|e| format!("thread spawn failed: {e}"))?;
    Ok(RemoteServer { port, token, ip, stop, alive })
}

// ---------- Tauri commands ----------

#[tauri::command]
pub fn remote_start(state: State<'_, AppState>) -> Result<Value, String> {
    let mut guard = state.remote.lock().map_err(|_| "remote lock poisoned")?;
    match guard.as_ref() {
        Some(s) if s.alive.load(Ordering::Relaxed) => Ok(s.info()),
        _ => {
            *guard = None;
            let server = start_server()?;
            let info = server.info();
            *guard = Some(server);
            Ok(info)
        }
    }
}

#[tauri::command]
pub fn remote_status(state: State<'_, AppState>) -> Value {
    let guard = state.remote.lock().ok();
    match guard {
        Some(g) => match g.as_ref() {
            Some(s) if s.alive.load(Ordering::Relaxed) => s.info(),
            _ => json!({ "ok": false, "running": false }),
        },
        None => json!({ "ok": false, "running": false }),
    }
}

#[tauri::command]
pub fn remote_stop(state: State<'_, AppState>) -> Value {
    if let Ok(mut guard) = state.remote.lock() {
        if let Some(s) = guard.take() {
            s.stop.store(true, Ordering::Relaxed);
        }
    }
    json!({ "ok": true })
}
