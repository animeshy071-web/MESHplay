# MESHplay 🎮

A gaming OS for your PC. Console firmware feel — living wave wallpaper, crescent +
row game scrollers, auto-built library, phone-as-controller, Game Bar, achievements.

> **Status:** 🚀 M1–M5 feature-complete · packaged offline `.exe` / `.msi` installers

## Docs

- **[PLAN.md](./PLAN.md)** — the master plan: design law, architecture, roadmap M1–M6, security charter

## Principles

1. 60fps on any modern Windows — adaptive quality before stutter
2. Curvy, liquid, springy — zero hard rectangles
3. The library builds itself — ROMs and PC games detected automatically
4. Local-first: no accounts, no backend, no telemetry
5. Console rituals: boot, guide button, screensaver, synthesized UI sounds

## Build

```powershell
npm install
npm run tauri build   # → src-tauri/target/release/bundle/{msi,nsis}
npm run dev           # dev shell + LAN remote server
npm run test:gb       # Game Boy core smoke test (Node)
```

## Feature map

| Area | Where |
|---|---|
| Standalone offline app | Tauri v2 + bundled SQLite · MSI/NSIS installers |
| Phone controller (PWA) | `public/remote/` · served by the **native** Rust server (`src-tauri/src/remote.rs`) over LAN/hotspot/USB — gamepad, gyro wheel, fightstick, trackpad, haptics, editable layout, P1–P4 QR token pairing |
| PC game importer | PE header/icon parser (`pe.rs`), `.lnk` resolver, Steam VDF scan, ROM CRC32 scan (`romdb.ts` + optional OpenVGDB dump via `scripts/build-romdb.mjs`) |
| Online art (optional) | Steam store CDN (keyless) + SteamGridDB/RAWG/IGDB with user keys — Library 🌐 button or Add Game dialog |
| Game Bar | Guide button / L1+R1+Select / Shift+Tab — perf, mixer, states, 60s rewind, filters, capture |
| Settings suite | Real monitor/resolution/output-device selectors, sleep timer (standby), spatial widening, drift visualizer, 8-button remapper, ViGEm bridge check |
| Emulation | CHIP-8 + Game Boy (SM83/PPU/APU/MBC) with save states, instant resume, rewind |
| M5 remap layer | Gamepad → keyboard/mouse for native games (`remap.ts`), wheel gyro → A/D steering, **anti-cheat auto-disable** (`anticheat.ts`) |
| Spotify | Real Web API + PKCE auth (`spotify.ts`) — user's own Client ID, Premium for control |

