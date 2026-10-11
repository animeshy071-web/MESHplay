// Core dispatch — the single entrypoint PlayView uses. Picks the right core
// for a game: built-in TypeScript cores (CHIP-8, Game Boy), bundled
// mini-RetroArch WASM cores for everything else, with honest availability.

import type { Game } from '../system/library'
import { Chip8 } from '../chip8/core'
import { GameBoy } from '../gb/gb'
import { Chip8Core, GameBoyCore } from './builtin'
import { EjsCore } from './ejs'
import { platformForKind, type PlatformDef } from './registry'
import type { EmuCore } from './types'

export * from './types'
export { PLATFORMS, PLATFORM_BY_ID, platformForKind, type PlatformDef } from './registry'
export { applyPortsToCore, keyToButton, setKeyboardButton, setKeyboardStick, setPhoneAxes, setPhoneButton, setPhonePointer, setPhoneWheelCore, clearAllPorts } from './inputRouter'

const BASE = import.meta.env.BASE_URL ?? '/'

const availabilityCache = new Map<string, boolean>()

/** Is the bundled core (js glue + wasm) present for this platform? */
export async function isCoreBundled(def: PlatformDef): Promise<boolean> {
  if (def.core === 'builtin') return true
  if (def.tier === 'bridge' || !def.file) return false
  const cached = availabilityCache.get(def.id)
  if (cached !== undefined) return cached
  try {
    const r = await fetch(`${BASE}cores/${def.file}/${def.file}.js`, { method: 'HEAD' })
    const ok = r.ok
    availabilityCache.set(def.id, ok)
    return ok
  } catch {
    availabilityCache.set(def.id, false)
    return false
  }
}

export interface CreateCoreResult {
  core: EmuCore | null
  error?: string
  platform?: PlatformDef
  /** scanned absolute path — some cores (arcade/disc) may need real files */
  realPath: string | null
}

/**
 * Create the right core for a game and load its ROM.
 * @param rom raw ROM bytes
 * @param canvas the PlayView canvas — self-rendering cores (all WASM cores)
 *   draw straight into it with their embedded RetroArch frontend
 * @param realPath absolute ROM path on disk, when the game was scanned
 */
export async function createCore(game: Game, rom: Uint8Array, canvas: HTMLCanvasElement | null, realPath: string | null): Promise<CreateCoreResult> {
  const def = platformForKind(game.kind)
  if (!def) return { core: null, error: `unknown platform "${game.kind}"`, realPath }

  if (def.core === 'builtin') {
    if (def.id === 'chip8') {
      const adapter = new Chip8Core()
      adapter.attach(new Chip8(rom))
      return { core: adapter, platform: def, realPath }
    }
    const adapter = new GameBoyCore()
    adapter.attach(new GameBoy(rom, null))
    return { core: adapter, platform: def, realPath }
  }

  if (def.tier === 'bridge') {
    return { core: null, error: `${def.label} runs through bridge mode (external engine)`, platform: def, realPath }
  }

  const bundled = await isCoreBundled(def)
  if (!bundled) {
    return {
      core: null,
      error: `${def.label} core is not bundled yet — run "npm run cores" at build time to embed it`,
      platform: def,
      realPath,
    }
  }
  if (!canvas) return { core: null, error: 'no canvas available for the core', platform: def, realPath }

  const res = await EjsCore.load(def, canvas, `${BASE}cores/`)
  if (!res.core) return { core: null, error: res.error ?? 'core failed to load', platform: def, realPath }
  try {
    const ext = (game.rom?.split('.').pop() ?? def.romExts[0] ?? 'bin').toLowerCase()
    res.core.boot(rom, ext)
  } catch (err) {
    res.core.destroy()
    return { core: null, error: err instanceof Error ? err.message : String(err), platform: def, realPath }
  }
  return { core: res.core, platform: def, realPath }
}

/** Human-readable status line for the loading ring / error state. */
export function coreStatusLine(def: PlatformDef): string {
  if (def.core === 'builtin') return `${def.label} · built-in core`
  if (def.tier === 'bridge') return `${def.label} · bridge mode`
  return `${def.label} · ${def.core}`
}
