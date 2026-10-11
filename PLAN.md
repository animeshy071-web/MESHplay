# MESHplay — Master Plan (GOD LEVEL)

> A gaming OS for your PC: a full-screen console experience that finds your games,
> dresses them in living color, and plays them with a controller, a phone, or a
> steering wheel. Built to run at 60fps on any modern Windows PC.

**Status**: M1–M7 feature-complete · v0.5.0 (offline .exe/.msi shipped)
**Owner**: @animeshy071-web · **Repo ritual**: push + tag after every milestone

---

## 1. Vision

MESHplay is not a launcher. It is the **operating-system feel of a game console,
running on your PC**. You boot it and it behaves like a PS5: a boot animation,
a home of glowing tiles over a living wallpaper that recolors itself to whatever
you hover, a detail page, a loading ring, and the game. Your phone becomes a
controller over Wi-Fi. Your library builds itself — ROM folders, Steam games,
art and logos all detected and fetched automatically.

### Pillars
1. **Smooth above all** — 60fps on integrated graphics, adaptive quality before stutter.
2. **Curvy, liquid design** — nothing hard-edged; color flows, shapes round, motion springs.
3. **Zero manual library work** — detection, art, logos: automatic.
4. **Console rituals** — boot, guide button, screensaver, sounds. It must *feel* like firmware.
5. **Local-first & private** — no accounts, no backend required, no telemetry.

---

## 2. Design Law (the bible — every screen obeys)

### 2.1 Theme system
Five gradients only, selectable in-app. Each recolors wallpaper, accents, glow,
loader and screensaver in one smooth transition. Default: Violet Waves.

| # | Name | Palette |
|---|------|---------|
| 1 | **Violet Waves** ⭐ | deep space purple → violet core → lavender light |
| 2 | Ember | abyss red → molten orange |
| 3 | Ocean | deep blue → cyan |
| 4 | Emerald | dark forest → mint |
| 5 | Monolith | pure black → white light |

Per-game wallpaper: focused game's gradient is derived from its art (dominant
colors) and the wallpaper blobs morph toward it.

### 2.2 Curvy law
- Squircle cards (continuous corners), glass panels (blur + curve, no border boxes)
- Pill buttons, 2% press-squish
- Breathing curved loading ring
- Zero hard rectangles anywhere

### 2.3 Motion rules
- **GPU-composited only**: animate `transform` + `opacity`. Never layout properties.
- Console-grade durations: nav 150ms, focus 300ms, transitions 450–600ms, wallpaper drift 20s loops
- Spring/ease-out curves everywhere, nothing linear
- Blur is precomputed & cached — never live-blurred per frame
- Animation never waits for data (optimistic UI; art loads behind motion)
- Boot & focus animations frame-synced with sound
- **Adaptive quality**: effects degrade (blur → none, particles → fewer) before fps does

### 2.4 Sound map (all synthesized, WebAudio — no audio files)
| Event | Sound |
|---|---|
| Travel (nav move) | short low boop |
| Select | two-tone brighter boop |
| Back | descending boop |
| Error | soft thud |
| Launch | whoosh + sub swell |
| Achievement | sting + toast |

### 2.5 Navigation — dual scroller
- **Crescent mode**: covers ride an arc hugging the screen edge (reference: curved
  cover-flow); focused cover lifts out of the curve with glow + depth
- **Row mode**: PS-style horizontal tile row
- Switchable via shoulder buttons; default set in Settings → General

---

## 3. Tech Stack

| Layer | Tech | Why |
|---|---|---|
| UI | React + TypeScript + Tailwind | fastest route to GOAT-tier UI; fully visually testable |
| Shell & Native Host | **Tauri v2 (Rust)** | **100% offline standalone Windows .exe**, ~15MB, zero mandatory cloud, native FS/process/stats access, ultra-low RAM |
| Emulation cores | TypeScript (CHIP-8) → Rust→WASM (Game Boy, later) | speed + portability (same cores later on phone), works fully offline |
| Sound | WebAudio synthesis | zero external assets, procedural real-time synthesis, frame-syncable |
| Data & Storage | SQLite + JSON config | local library, playtime logs, saves, settings, zero telemetry |
| Phone remote | **Offline Phone App (PWA / Capacitor / APK)** + LAN WebSocket (Tauri) | **100% offline phone controller**, local Wi-Fi / hotspot / USB tethering, ~5–15ms latency, zero cloud relay |
| Game ID & Scraping | PE Metadata Parser + OpenVGDB/libretro hash DB + SteamGridDB/Steam/IGDB | offline executable identification + local hash fallback + optional online art scraping |
| Backend | **None.** Fully offline-first. Optional Cloudflare Worker for personal API key shielding | local-first privacy and complete standalone functionality |

## 4. Architecture

```
┌────────────────────────── MESHplay.exe (Offline Windows Desktop Runtime) ──────────────────────────┐
│                                                                                                    │
│  ┌─────────────────────── UI (React/TS, GPU-Composited Console Firmware) ───────────────────────┐  │
│  │ Boot → Home (crescent/row) → Detail → Loading ring → Play                                     │  │
│  │ Wave Wallpaper Engine (WebGL2 / Canvas, pooled, adaptive quality)                             │  │
│  │ Floating In-Game Game Bar (stats, mixer, filters, capture, states) · Guide · Settings        │  │
│  └──────────────────────────────────────┬────────────────────────────────────────────────────────┘  │
│                                         │                                                           │
│  ┌──────────────────────────────────────┴───┐   ┌──────────────────────────────────────────────┐    │
│  │ Core Service (WASM/TS, Offline)          │   │ Platform & Library Service (Rust Native)     │    │
│  │ · CHIP-8, Game Boy engines               │   │ · Real PC Game Identification (PE headers)   │    │
│  │ · Save states, continuous rewind buffer  │   │ · File Manager custom game importer (.exe)   │    │
│  │ · Display filter pipeline (CRT/LCD/Sharp)│   │ · ROM scan + hash ID (OpenVGDB / libretro)   │    │
│  └──────────────────────────────────────────┘   │ · Process lifecycle & playtime supervision   │    │
│                                                 │ · SQLite database & settings manager         │    │
│  ┌──────────────────────────────────────────┐   │ · ViGEm virtual controller driver (M5)       │    │
│  │ LAN Remote Server (Offline)              │   └──────────────────────────────────────────────┘    │
│  │ · Local Wi-Fi / Hotspot / USB connection │   ┌──────────────────────────────────────────────┐    │
│  │ · QR pairing with local security token   │   │ Optional Net Scraper (Online Fallback)       │    │
│  │ · 60Hz input stream + rumble haptics     │◄──┤ · SteamGridDB, Steam API, RAWG metadata      │    │
│  │ · Dual-analog, D-pad, triggers & gyro    │   │ · RetroAchievements bridge                   │    │
│  └──────────────────────────────────────────┘   └──────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
          ▲                                                           ▲
          │ Physical controller / wheel / pedals (HID)                │ Offline Phone App (PWA/APK) over LAN
```

## 5. Security & Permissions Charter

- No admin required to run (exception, once, at opt-in: ViGEm driver install in M5)
- Reads Steam libraries **read-only** via official paths; scans only user-chosen folders
- **Never deletes silently**: ROM removal → Recycle Bin + confirm; Steam uninstalls → Steam's own dialog; saves → storage manager + confirm
- Game Bar for our games = native overlay; for launched PC games = companion always-on-top floating stats widget (no injection into other processes — antivirus-friendly)
- QR remote: one-time pairing token, LAN-bound, master kill-switch, traffic never leaves the home network
- Controller→keyboard/mouse layer: single-player use; anti-cheat games marked unsupported, not fought
- Zero telemetry. API keys local (later proxied). Unsigned exe shows one SmartScreen prompt until code-signed

## 6. Feature Inventory (screens × milestone)

**M1 — The Console Shell & Commercial OS Settings**:
- Boot sequence → Home (crescent + row, switchable, default in settings) → Game Detail → loading ring → CHIP-8 gameplay → pause overlay → toasts → wave wallpaper + PS3 purple mode → top bar → bottom hints → sound synthesis → FPS counter → empty state.
- **Commercial-Grade OS Settings Suite**:
  - **Profile & Identity**: Custom gamertag, avatar selector, custom bio, player badges, total hours played, trophies count, local PIN lock.
  - **Audio & Volume Control**: Master volume slider, UI sound effects volume slider, game volume slider, audio output device selector (Headphones / Speakers), spatial audio toggle, mute-on-window-blur toggle.
  - **Display & Graphics**: Fullscreen / Borderless Windowed / Windowed modes, resolution selector, display monitor selector, target FPS limit (30, 60, 120, uncapped), V-Sync toggle, HDR toggle.
  - **Power & System**: Sleep timer (15m, 30m, 1h, never), screen dimming on idle, Start with Windows toggle, auto-launch in fullscreen, laptop battery-saver mode.
  - **Controller & Input Calibration**: Analog stick deadzone calibration, rumble/vibration intensity slider, button mapping visualizer, auto-switch between gamepad and mouse.
  - **Storage & Data Management**: Storage analyzer (Games, Saves, Screenshots, Cache breakdown), save state export/import to ZIP, cache cleaner, safe deletion routing.

**M2 — Offline Phone Controller App**:
- **100% Offline Mobile App** (Installable PWA & standalone Capacitor APK): zero internet required, pairs over local Wi-Fi, mobile hotspot, or direct USB tethering.
- **Complete Controller UI Suite**:
  - **Standard Gamepad**: Ergonomic D-Pad with diagonal glide, tactile ABXY action cluster, dual analog thumbsticks with clickable L3/R3, shoulder bumpers (L1/R1) and analog triggers (L2/R2), Select, Start, Guide/Home.
  - **Steering Wheel Mode**: Gyroscope tilt-to-steer steering wheel with on-screen brake/gas pedals and paddle shifters.
  - **Arcade Fight-Stick Mode**: 6-button arcade layout for fighting games.
  - **Trackpad / Mouse Mode**: Touchpad surface for mouse cursor navigation in PC games.
  - **Customizer & Haptics**: Button repositioning, scale customization, and device rumble haptics slider.
- QR pairing screen with local token handshake, player slots (P1–P4), controller hardware tester.

**M3 — The Self-Building Library & Real PC Game Importer**:
- **Real-World PC Game Identification Engine**:
  - Native file manager importer: pick any `.exe`, `.lnk`, `.bat`, or folder.
  - PE header binary parser: reads executable metadata (`FileDescription`, `ProductName`, `CompanyName`, version info, embedded PE icons).
  - Offline name normalization & local hash database match + online scrapers (Steam, SteamGridDB, IGDB) when connected.
  - Custom game addition dialog: edit title, attach custom box art/banner/logo, add custom launch arguments, set custom working directories, and pair emulator cores.
- Automated ROM folder scan + hash ID (OpenVGDB / libretro), Steam library auto-detection (read-only VDF parsing), platform filter chips & badges, Continue Playing row, universal search, Surprise Me, playtime tracking, first-run onboarding.

**M4 — Deep Emulation & Floating In-Game Game Bar**:
- **Floating In-Game Game Bar**:
  - Activated during gameplay via controller Guide button (`Xbox`/`PS`), controller shortcut (`L1+R1+Select`), or keyboard (`Win+G`, `Shift+Tab`, `Esc`).
  - Floating translucent glass HUD with movable widgets:
    - **Real-Time Performance Monitor**: FPS counter, frame-time graph, CPU, GPU, RAM, battery percentage.
    - **Multi-Channel Audio Mixer**: Master volume, Game sound, Spotify playback, and Voice chat sliders.
    - **Quick State Manager**: Fast Save, Load, and visual thumbnail state slots.
    - **Real-Time Rewind Slider**: Rewind gameplay seamlessly up to 60 seconds backwards.
    - **Retro Display Filters**: Instant switcher between CRT Scanlines, LCD Grid, Sharp Nearest-Neighbor, and Smooth Bilinear.
    - **Media Capture**: One-tap screenshot capture and instant 30-second video replay buffer.
    - **Controller Status**: Battery gauge and connected player indicators (P1–P4).
    - **Exit & Reset**: Soft reset game, hard reset, or quit to dashboard with confirmation.
- Game Boy core (Rust→WASM), save states, Instant Resume, launch preloader (hover-precaching), RetroAchievements integration, **Find My Controller** easter egg (sonar rumble + radar), **Mood Recommender** (mood chips + free text → RAWG/IGDB).

**M5 — Universal Controller Layer**:
- Any gamepad → keyboard/mouse remapping, per-game profiles, wheel/pedal mapping + wheel navigates UI, ViGEm virtual controller driver for launched PC games, anti-cheat game detection & labeling.

**M6 — Ship & Polish (Offline Standalone Windows App)**:
- **Offline Standalone Windows .exe**: Tauri packaging + standalone MSI/EXE installer with all runtimes bundled; runs 100% offline out of the box with zero dependencies.
- **Spotify connection** (now-playing chip, in-game mixer control, Spotify-device throw — Premium required for control/playback), **screensaver system** (music mode w/ art drift → clock mode w/ gradient waves → attract reels), themes unlockables, screenshots gallery, storage manager, profile & playtime stats, laptop/battery mode, Windows game mode toggle, controller health (drift test), bedtime wind-down, konami code.

**M7 — Universal Emulation Core Layer (Everything Up to PS3, Zero Extra Downloads)**:
- **Unified core contract** (`src/cores`): every emulator — built-in CHIP-8/Game Boy or bundled WASM — implements one `EmuCore` interface; PlayView, rewind, save states, Game Bar, filters and the input router are fully core-agnostic.
- **Mini-RetroArch core driver** (`ejs.ts`): runs official emscripten core builds embedded in the app (`public/cores/<core>/`) — internal main loop, audio, GL/2D rendering into the game canvas, save states, SRAM, 4-port controller bus.
- **Bundled cores** (`npm run cores`): NES, SNES, Genesis/Mega Drive, Master System, Game Gear, Sega CD, 32X, GBA, PC Engine, Neo Geo, Arcade (FBNeo), ColecoVision, Atari 7800, Atari Lynx, 3DO, Atari Jaguar, **PlayStation, Nintendo 64, Sega Saturn, Nintendo DS** — 20 platforms embedded, zero user downloads. Registry stays honest for platforms awaiting public WASM builds (A2600, Vectrex, WonderSwan, MSX, Dreamcast, PSP, PS2, GC, Wii, 3DS) — they light up the moment a build lands.
- **4-player input router**: keyboard → P1, physical gamepads → ports in enumeration order, phone remotes → pairing slots P1–P4. Phone controller types all route in: gamepad, arcade fight-stick, gyro wheel (→ analog axis), trackpad (→ pointer/touch).
- **Per-player phone tagging**: the native LAN server (`remote.rs`) tags every input message with the sender's pairing slot; P1 keeps OS/console injection, P2–P4 go straight to emulator ports.
- **Scanner expansion** (`roms.rs`): all cartridge extensions recognized + disc images (cue/iso/chd/…) platform-matched by folder naming; archive zips (Neo Geo/Arcade) detected.
- **PS3 remains bridge-tier by design** (RPCS3-class problem — see Honest Limits).

### Personal features (user-specified, sacred)
1. **Offline Standalone Windows App** — One self-contained `.exe` installer, 100% offline functionality, embedded database, zero account required.
2. **Offline Phone Controller App** — Complete console controller UI over local network / hotspot (D-pad, ABXY, dual sticks, triggers, wheel gyro, fightstick, trackpad).
3. **Real PC Game Identifier & Custom Importer** — Extracts real executable metadata, embedded icons, supports custom box art attachment and launch args.
4. **Floating In-Game Game Bar** — Overlay summoned via Guide button with stats, audio mixer, save states, rewind, filters, and capture.
5. **Commercial-Grade OS Settings Suite** — Complete profile, multi-channel volume, display/resolution, power, input calibration, and storage controls.
6. **Find My Controller** — PC pings lost controller: rumble bursts + PC sonar + radar UI naming its port.
7. **Mood Recommender** — type a mood or tap chips → internet game database → recommendations; also "play one from your shelf" mode.
8. **Gyro** — phone motion sensors over the remote link: tilt-to-steer + gyro-as-mouse; iOS shows a one-tap motion permission.

## 7. QA Process (per milestone)

1. **Machine QA (agent)**: every screen screenshotted and reviewed; frame-time profiling on the wave engine and scrollers; adaptive-quality ladder verified; sounds triggered on correct frames
2. **Human QA (owner)**: feel test — boop timing, curve tightness, wave speed, controller ergonomics; tuning requests → agent implements
3. Definition of Done = machine QA green + owner feel-signoff

## 8. Repo Ritual (every milestone)

- Branch: `main` only during solo build; conventional commits (`feat:`, `fix:`, `docs:`)
- Milestone end → version tag (`v0.1.0-m1`, `v0.2.0-m2`, …) → push → GitHub Release with notes + screenshots
- `PLAN.md` checkbox tables updated at each milestone close
- Never commit secrets/keys/ROMs (homebrew ROMs are committed — they're free)

## 9. Honest Limits

- Spotify control/playback requires Premium (free = display only)
- Touch-only phone games can't gain controller support (Android limits)
- Anti-cheat online games block simulated input by design
- SmartScreen "unknown publisher" until code signing is purchased
- Emulated-game legality: MESHplay ships no commercial ROMs, ever

## 10. Smart Backlog (post-M6 pulls)
Cloud-save sync (user's own Drive/WebDAV) · achievement auto-clips · save versioning rollback · time-aware suggestions (HowLongToBeat) · backlog radar · smart ROM scanner (corrupt/dup/region/fan-translation flags) · weekly recap · "continue on phone" state handoff · voice search · second-screen phone apps.

---

## Milestone Tracker

- [x] **M1 — Console Shell & OS Settings Suite** (boot, wallpaper, dual scroller, detail, loading ring, CHIP-8, pause, toasts, sound synthesis, themes, FPS, full Profile/Audio/Video/System settings suite)
- [x] **M2 — Offline Phone Controller App** (standalone offline PWA/APK, QR/LAN/Hotspot, full gamepad UI, D-pad diagonal glide, sticks, triggers, wheel gyro, fightstick, haptics, editable layout, **native Rust server in the packaged app**)
- [x] **M3 — Self-Building Library & Real PC Game Importer** (PE metadata game ID, custom .exe importer with art attachment, ROM scan/hash + optional OpenVGDB dump, Steam detection, universal search, Continue Playing, **online art scrapers**)
- [x] **M4 — Deep Emulation & Floating In-Game Game Bar** (GB core, states, rewind, floating Game Bar with stats/mixer/filters/capture, **RetroAchievements**, Find My Controller, **Mood Recommender**)
- [x] **M5 — Universal Controller Layer** (gamepad→keyboard/mouse remap with OS injection, wheel/pedal mapping, ViGEm bridge status+guide, **anti-cheat auto-disable**)
- [x] **M6 — Ship & Polish (Offline Standalone PC App)** (Tauri .exe/.msi packaging, 100% offline mode, **real Spotify Connect (PKCE)**, screensaver system, gallery, storage manager, diagnostics)
- [x] **M7 — Universal Emulation Core Layer** (unified core contract, mini-RetroArch WASM driver, **20 consoles embedded** — NES→NDS incl. PS1/N64/Saturn, 4-player input router, per-player phone tagging, disc-image scanner)
