// Platform registry — the single source of truth for every emulated system.
// A platform is playable when its core binary is bundled (public/cores/<core>/)
// at build time via `npm run cores`; the app then needs nothing extra at
// runtime. `tier` is the honest hardware/classification label:
//   flawless  — full speed on any modern PC, near-zero per-game issues
//   fullspeed — full speed on a normal quad-core PC, rare per-game quirks
//   bridge    — handled by an external engine (PS3), launch-only
// `core` is the libretro core id — bundled cores are mini-RetroArch builds
// (emscripten js+wasm) driven through the EJS-style ABI (simulate_input etc.).

export interface PlatformDef {
  id: string
  label: string
  short: string
  year: number
  tier: 'flawless' | 'fullspeed' | 'bridge'
  /** libretro core id — also the folder name under public/cores/ */
  core: string
  file: string // public/cores/<file>/<file>.{js,wasm} (empty for builtin/bridge)
  romExts: string[]
  players: 1 | 2 | 3 | 4
  fps: number
  aspect: number
  /** BIOS/system files the user must drop in (never shippable — copyrighted) */
  bios?: string[]
}

export const PLATFORMS: PlatformDef[] = [
  // ---------- built-in (always available, written in TypeScript) ----------
  {
    id: 'chip8', label: 'CHIP-8', short: 'CHIP-8', year: 1977,
    tier: 'flawless', core: 'builtin', file: '',
    romExts: ['ch8'], players: 1, fps: 60, aspect: 2,
  },
  {
    id: 'gb', label: 'Game Boy / Color', short: 'GB', year: 1989,
    tier: 'flawless', core: 'builtin', file: '',
    romExts: ['gb', 'gbc'], players: 1, fps: 59.73, aspect: 10 / 9,
  },

  // ---------- tier: flawless ----------
  {
    id: 'nes', label: 'NES / Famicom', short: 'NES', year: 1983,
    tier: 'flawless', core: 'nestopia', file: 'nestopia',
    romExts: ['nes', 'fds', 'unf', 'unif'], players: 2, fps: 60.1, aspect: 4 / 3,
  },
  {
    id: 'snes', label: 'SNES / Super Famicom', short: 'SNES', year: 1990,
    tier: 'flawless', core: 'snes9x', file: 'snes9x',
    romExts: ['sfc', 'smc', 'fig', 'swc'], players: 4, fps: 60.1, aspect: 4 / 3,
  },
  {
    id: 'genesis', label: 'Genesis / Mega Drive', short: 'MD', year: 1988,
    tier: 'flawless', core: 'genesis_plus_gx', file: 'genesis_plus_gx',
    romExts: ['md', 'gen', 'smd', 'bin'], players: 4, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'sms', label: 'Master System', short: 'SMS', year: 1985,
    tier: 'flawless', core: 'smsplus', file: 'smsplus',
    romExts: ['sms'], players: 2, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'gg', label: 'Game Gear', short: 'GG', year: 1990,
    tier: 'flawless', core: 'genesis_plus_gx', file: 'genesis_plus_gx',
    romExts: ['gg'], players: 2, fps: 60, aspect: 10 / 9,
  },
  {
    id: 'segacd', label: 'Sega CD', short: 'SCD', year: 1991,
    tier: 'flawless', core: 'genesis_plus_gx', file: 'genesis_plus_gx',
    romExts: ['cue', 'iso'], players: 2, fps: 60, aspect: 4 / 3,
    bios: ['bios_CD_E.bin', 'bios_CD_U.bin', 'bios_CD_J.bin'],
  },
  {
    id: 'sega32x', label: 'Sega 32X', short: '32X', year: 1994,
    tier: 'flawless', core: 'picodrive', file: 'picodrive',
    romExts: ['32x'], players: 2, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'gba', label: 'Game Boy Advance', short: 'GBA', year: 2001,
    tier: 'flawless', core: 'mgba', file: 'mgba',
    romExts: ['gba'], players: 4, fps: 59.73, aspect: 3 / 2,
  },
  {
    id: 'pce', label: 'TurboGrafx-16 / PC Engine', short: 'PCE', year: 1987,
    tier: 'flawless', core: 'mednafen_pce', file: 'mednafen_pce',
    romExts: ['pce', 'sgx'], players: 4, fps: 59.82, aspect: 4 / 3,
    bios: ['syscard3.pce'],
  },
  {
    id: 'neogeo', label: 'Neo Geo', short: 'NG', year: 1990,
    tier: 'flawless', core: 'fbneo', file: 'fbneo',
    romExts: ['zip', '7z'], players: 4, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'arcade', label: 'Arcade', short: 'ARCADE', year: 1980,
    tier: 'flawless', core: 'fbneo', file: 'fbneo',
    romExts: ['zip'], players: 4, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'a7800', label: 'Atari 7800', short: '7800', year: 1986,
    tier: 'flawless', core: 'prosystem', file: 'prosystem',
    romExts: ['a78'], players: 2, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'lynx', label: 'Atari Lynx', short: 'LYNX', year: 1989,
    tier: 'flawless', core: 'handy', file: 'handy',
    romExts: ['lnx'], players: 2, fps: 60, aspect: 4 / 3,
    bios: ['lynxboot.img'],
  },
  {
    id: 'coleco', label: 'ColecoVision', short: 'COLECO', year: 1982,
    tier: 'flawless', core: 'fbneo', file: 'fbneo',
    romExts: ['col'], players: 2, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'pcfx', label: 'PC-FX', short: 'PC-FX', year: 1994,
    tier: 'flawless', core: 'beetle_pcfx', file: 'beetle_pcfx',
    romExts: ['cue', 'toc'], players: 2, fps: 59.82, aspect: 4 / 3,
    bios: ['pcfx.rom'],
  },
  {
    id: 'a3do', label: '3DO', short: '3DO', year: 1993,
    tier: 'fullspeed', core: 'opera', file: 'opera',
    romExts: ['cue', 'iso'], players: 2, fps: 60, aspect: 4 / 3,
    bios: ['panafz10.bin'],
  },
  {
    id: 'jaguar', label: 'Atari Jaguar', short: 'JAG', year: 1993,
    tier: 'fullspeed', core: 'virtualjaguar', file: 'virtualjaguar',
    romExts: ['j64', 'jag'], players: 2, fps: 60, aspect: 4 / 3,
  },

  // ---------- tier: fullspeed ----------
  {
    id: 'psx', label: 'PlayStation', short: 'PS1', year: 1994,
    tier: 'fullspeed', core: 'pcsx_rearmed', file: 'pcsx_rearmed',
    romExts: ['cue', 'toc', 'ccd', 'pbp', 'chd', 'iso'], players: 4, fps: 59.83, aspect: 4 / 3,
    bios: ['scph1001.bin', 'scph5501.bin', 'scph5552.bin'],
  },
  {
    id: 'n64', label: 'Nintendo 64', short: 'N64', year: 1996,
    tier: 'fullspeed', core: 'mupen64plus_next', file: 'mupen64plus_next',
    romExts: ['n64', 'z64', 'v64', 'ndd'], players: 4, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'saturn', label: 'Sega Saturn', short: 'SATURN', year: 1994,
    tier: 'fullspeed', core: 'yabause', file: 'yabause',
    romExts: ['cue', 'ccd', 'iso'], players: 2, fps: 57.5, aspect: 4 / 3,
    bios: ['saturn.bin'],
  },
  {
    id: 'nds', label: 'Nintendo DS', short: 'NDS', year: 2004,
    tier: 'fullspeed', core: 'melonds', file: 'melonds',
    romExts: ['nds'], players: 4, fps: 59.83, aspect: 3 / 2,
    bios: ['bios7.bin', 'bios9.bin', 'firmware.bin'],
  },
  // awaiting public WASM builds — the registry stays honest, cores plug in
  // the moment a build lands in public/cores/<core>/ (see npm run cores)
  {
    id: 'a2600', label: 'Atari 2600', short: '2600', year: 1977,
    tier: 'flawless', core: 'stella', file: 'stella',
    romExts: ['a26'], players: 2, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'vectrex', label: 'Vectrex', short: 'VECTREX', year: 1982,
    tier: 'flawless', core: 'vecx', file: 'vecx',
    romExts: ['vect', 'vec'], players: 2, fps: 60, aspect: 4 / 3,
  },
  {
    id: 'wswan', label: 'WonderSwan / Color', short: 'WS', year: 1999,
    tier: 'flawless', core: 'beetle_cygne', file: 'beetle_cygne',
    romExts: ['ws', 'wsc'], players: 2, fps: 75.47, aspect: 3 / 2,
  },
  {
    id: 'msx', label: 'MSX', short: 'MSX', year: 1983,
    tier: 'flawless', core: 'bluemsx', file: 'bluemsx',
    romExts: ['mx1', 'mx2', 'dsk'], players: 2, fps: 60, aspect: 4 / 3,
    bios: ['CBIOS_ROM'],
  },
  {
    id: 'dc', label: 'Dreamcast', short: 'DC', year: 1998,
    tier: 'fullspeed', core: 'flycast', file: 'flycast',
    romExts: ['cue', 'cdi', 'chd', 'gdi'], players: 4, fps: 60, aspect: 4 / 3,
    bios: ['dc_boot.bin', 'dc_flash.bin'],
  },
  {
    id: 'psp', label: 'PSP', short: 'PSP', year: 2004,
    tier: 'fullspeed', core: 'ppsspp', file: 'ppsspp',
    romExts: ['iso', 'cso', 'pbp'], players: 4, fps: 60, aspect: 480 / 272,
  },
  {
    id: 'ps2', label: 'PlayStation 2', short: 'PS2', year: 2000,
    tier: 'fullspeed', core: 'lrps2', file: 'lrps2',
    romExts: ['cue', 'iso', 'chd', 'gz'], players: 4, fps: 60, aspect: 4 / 3,
    bios: ['ps2-0220e.bin'],
  },
  {
    id: 'gc', label: 'GameCube', short: 'GC', year: 2001,
    tier: 'fullspeed', core: 'dolphin', file: 'dolphin',
    romExts: ['gcm', 'rvz'], players: 4, fps: 60, aspect: 3 / 2,
    bios: ['IPL.bin'],
  },
  {
    id: 'wii', label: 'Wii', short: 'WII', year: 2006,
    tier: 'fullspeed', core: 'dolphin', file: 'dolphin',
    romExts: ['iso', 'wad', 'rvz'], players: 4, fps: 60, aspect: 3 / 2,
  },
  {
    id: '3ds', label: 'Nintendo 3DS', short: '3DS', year: 2011,
    tier: 'fullspeed', core: 'azahar', file: 'azahar',
    romExts: ['3ds', 'cci', 'cxi'], players: 4, fps: 60, aspect: 3 / 2,
  },

  // ---------- tier: bridge (external engine, launch-only) ----------
  {
    id: 'ps3', label: 'PlayStation 3', short: 'PS3', year: 2006,
    tier: 'bridge', core: 'rpcs3-bridge', file: '',
    romExts: [], players: 4, fps: 30, aspect: 16 / 9,
  },
]

export const PLATFORM_BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]))

/** ROM file extension → platform id (first match wins). */
export const EXT_TO_PLATFORM = new Map<string, string>()
for (const p of PLATFORMS) {
  for (const ext of p.romExts) {
    if (!EXT_TO_PLATFORM.has(ext)) EXT_TO_PLATFORM.set(ext, p.id)
  }
}

/** Human labels from the Rust scanner → platform ids. */
export const LABEL_TO_PLATFORM = new Map<string, string>([
  ['CHIP-8', 'chip8'],
  ['Game Boy', 'gb'],
  ['Game Boy Advance', 'gba'],
  ['NES', 'nes'],
  ['SNES', 'snes'],
  ['Master System', 'sms'],
  ['Game Gear', 'gg'],
  ['Mega Drive', 'genesis'],
  ['PC Engine', 'pce'],
  ['Nintendo 64', 'n64'],
  ['Atari 2600', 'a2600'],
  ['Atari 7800', 'a7800'],
  ['ColecoVision', 'coleco'],
  ['Vectrex', 'vectrex'],
  ['Sega CD', 'segacd'],
  ['Sega 32X', 'sega32x'],
  ['PC-FX', 'pcfx'],
  ['Neo Geo', 'neogeo'],
  ['Arcade', 'arcade'],
  ['Atari Lynx', 'lynx'],
  ['WonderSwan', 'wswan'],
  ['MSX', 'msx'],
  ['PlayStation', 'psx'],
  ['Sega Saturn', 'saturn'],
  ['Dreamcast', 'dc'],
  ['PSP', 'psp'],
  ['Nintendo DS', 'nds'],
  ['PlayStation 2', 'ps2'],
  ['GameCube', 'gc'],
  ['Wii', 'wii'],
  ['Nintendo 3DS', '3ds'],
  ['PlayStation 3', 'ps3'],
  ['3DO', 'a3do'],
  ['Atari Jaguar', 'jaguar'],
])

/** ROM kinds the UI library persists — 'chip8' | 'gb' kept for legacy rows. */
export type GameKind = 'native' | string

export function platformForKind(kind: string): PlatformDef | undefined {
  return PLATFORM_BY_ID.get(kind)
}

export function platformForLabel(label: string): PlatformDef | undefined {
  const id = LABEL_TO_PLATFORM.get(label)
  return id ? PLATFORM_BY_ID.get(id) : undefined
}
