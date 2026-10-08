# MESHplay — Master Plan (GOD LEVEL)

> A gaming OS for your PC: a full-screen console experience that finds your games,
> dresses them in living color, and plays them with a controller, a phone, or a
> steering wheel. Built to run at 60fps on any modern Windows PC.

**Status**: planning complete · production starting (M1)
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
| Shell | **Tauri (Rust)** | real Windows .exe, ~15MB, native FS/process/stats access, low RAM |
| Emulation cores | TypeScript (CHIP-8) → Rust→WASM (Game Boy, later) | speed + portability (same cores later on phone) |
| Sound | WebAudio synthesis | zero assets, frame-syncable |
| Data | SQLite + JSON config | local library, playtime, saves, settings |
| Phone remote | LAN WebSocket server (Tauri) + phone web page → later Capacitor app | no cloud, ~5–15ms latency |
| External APIs | OpenVGDB/libretro (ROM identification), SteamGridDB (art/logos), Steam (PC game art), RAWG/IGDB (recommender), RetroAchievements | free-tier, no backend of ours |
| Backend | **None for v1.** Later: tiny Cloudflare Worker to shield API keys; cloud sync via user's own storage | local-first privacy |

## 4. Architecture

```
┌────────────────────────── MESHplay.exe (Tauri/Rust) ──────────────────────────┐
│                                                                              │
│  ┌────────────── UI (React/TS, GPU-composited) ──────────────┐               │
│  │ Boot → Home (crescent/row) → Detail → Loading ring → Play │               │
│  │ Wave Wallpaper Engine (canvas, pooled, adaptive quality)  │               │
│  │ Game Bar overlay · Guide overlay · Screensaver · Settings │               │
│  └───────────────┬───────────────────────────────────────────┘               │
│                  │                                                           │
│  ┌───────────────┴───────────┐   ┌──────────────────────────┐               │
│  │ Core Service (WASM/TS)    │   │ Platform Service (Rust)  │               │
│  │ · CHIP-8, Game Boy        │   │ · ROM scan + hash ID     │               │
│  │ · save states, rewind     │   │ · Steam/exe detection    │               │
│  │ · filter pipeline         │   │ · process launch + stats │               │
│  └───────────────────────────┘   │ · SQLite, config         │               │
│                                  │ · ViGEm virtual pad (M5) │               │
│  ┌───────────────────────────┐   └──────────────────────────┘               │
│  │ LAN Remote Server         │   ┌──────────────────────────┐               │
│  │ · QR pairing + token      │   │ Net Client (outbound)    │               │
│  │ · input stream 60Hz       │◄──┤ · art/ID/achievements    │               │
│  │ · gyro stream             │   │ · recommender APIs       │               │
│  └───────────────────────────┘   └──────────────────────────┘               │
└──────────────────────────────────────────────────────────────────────────────┘
          ▲                                   ▲
          │ controller / wheel (HID)          │ phone browser = gamepad over Wi-Fi
```

## 5. Security & Permissions Charter

- No admin required to run (exception, once, at opt-in: ViGEm driver install in M5)
- Reads Steam libraries **read-only** via official paths; scans only user-chosen folders
- **Never deletes silently**: ROM removal → Recycle Bin + confirm; Steam uninstalls → Steam's own dialog; saves → storage manager + confirm
- Game Bar for our games = native overlay; for launched PC games = companion always-on-top stats widget (no injection into other processes — antivirus-friendly)
- QR remote: one-time pairing token, LAN-bound, master kill-switch, traffic never leaves the home network
- Controller→keyboard/mouse layer: single-player use; anti-cheat games marked unsupported, not fought
- Zero telemetry. API keys local (later proxied). Unsigned exe shows one SmartScreen prompt until code-signed

## 6. Feature Inventory (screens × milestone)

**M1 — The Console Shell**: boot placeholder → Home (crescent + row, switchable,
default-in-settings) → Game Detail → loading ring → CHIP-8 gameplay (homebrew
library) → pause overlay → toasts → wave wallpaper + per-game recolor → theme
picker (5 gradients) → top bar (clock, avatar) → bottom hints → travel/select/
back/error boops → FPS counter → empty state.

**M2 — Phone Controller**: QR pairing screen, LAN server + pairing token,
controller skin page (D-pad/ABXY/sticks/shoulders), 60Hz input stream, player
slots (P1–P4), controller test screen, haptics.

**M3 — The Self-Building Library**: folder scan + ROM hash identification,
cover/logo/art fetch, Steam detection + launch, platform chips + badges,
Continue Playing row, universal search, Surprise Me, playtime tracking,
first-run onboarding (theme → folder → controller check).

**M4 — Deep Emulation + Game Bar**: Game Boy core (Rust→WASM), save states,
Instant Resume, rewind, Game Bar overlay (stats, filters CRT/HD, audio mixer,
screenshot, states), launch preloader (hover-precaching), achievement popups
via RetroAchievements (CHIP-8 + GB), **Find My Controller** easter egg (sonar
rumble + radar screen), **Mood Recommender** (mood chips + free text → RAWG/IGDB
→ play-from-shelf mode).

**M5 — Universal Controller Layer**: any gamepad → keyboard/mouse remapping,
per-game profiles, wheel/pedal mapping + wheel navigates the UI, ViGEm virtual
pad for launched PC games, anti-cheat game detection & labeling.

**M6 — Ship & Polish**: Tauri packaging + installer, **Spotify connection**
(now-playing chip, in-game mixer control, Spotify-device throw — Premium required
for control/playback), **screensaver system** (music mode w/ art drift → clock
mode w/ gradient waves → attract reels), themes unlockables, screenshots
gallery, storage manager, profile & playtime stats, laptop/battery mode, Windows
game mode toggle, controller health (drift test), bedtime wind-down, konami code.

### Personal features (user-specified, sacred)
1. **Find My Controller** — PC pings lost controller: rumble bursts + PC sonar + radar UI naming its port (browser can rumble; pad can't self-beep — rumble+screen+sound instead)
2. **Mood Recommender** — type a mood or tap chips → internet game database → recommendations; also "play one from your shelf" mode
3. **Gyro** — phone motion sensors over the remote link: tilt-to-steer + gyro-as-mouse; iOS shows a one-tap motion permission

## 7. QA Process (per milestone)

1. **Machine QA (agent)**: every screen screenshotted and reviewed; frame-time
   profiling on the wave engine and scrollers; adaptive-quality ladder verified;
   sounds triggered on correct frames
2. **Human QA (owner)**: feel test — boop timing, curve tightness, wave speed,
   controller ergonomics; tuning requests → agent implements
3. Definition of Done = machine QA green + owner feel-signoff

## 8. Repo Ritual (every milestone)

- Branch: `main` only during solo build; conventional commits (`feat:`, `fix:`, `docs:`)
- Milestone end → version tag (`v0.1.0-m1`, `v0.2.0-m2`, …) → push → GitHub
  Release with notes + screenshots
- `PLAN.md` checkbox tables updated at each milestone close
- Never commit secrets/keys/ROMs (homebrew ROMs are committed — they're free)

## 9. Honest Limits

- Spotify control/playback requires Premium (free = display only)
- Touch-only phone games can't gain controller support (Android limits)
- Anti-cheat online games block simulated input by design
- SmartScreen "unknown publisher" until code signing is purchased
- Emulated-game legality: MESHplay ships no commercial ROMs, ever

## 10. Smart Backlog (post-M6 pulls)
Cloud-save sync (user's own Drive/WebDAV) · achievement auto-clips · save
versioning rollback · time-aware suggestions (HowLongToBeat) · backlog radar ·
smart ROM scanner (corrupt/dup/region/fan-translation flags) · weekly recap ·
"continue on phone" state handoff · voice search · second-screen phone apps.

---

## Milestone Tracker

- [ ] **M1 — Console Shell** (boot, wallpaper, dual scroller, detail, loading ring, CHIP-8, pause, toasts, 4 boops, themes, FPS)
- [ ] **M2 — Phone Controller** (QR, LAN, gamepad skin, gyro)
- [ ] **M3 — Self-Building Library** (scan/ID/art, Steam, search, Continue Playing, onboarding)
- [ ] **M4 — Deep Emulation + Game Bar** (GB core, states, rewind, achievements, Find My Controller, Mood Recommender)
- [ ] **M5 — Universal Controller Layer** (remap, wheel, ViGEm)
- [ ] **M6 — Ship & Polish** (packaging, Spotify, screensaver, gallery, stats, unlockables)
