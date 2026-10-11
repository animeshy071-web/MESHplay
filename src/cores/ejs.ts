// Mini-RetroArch core driver — runs the bundled emscripten cores (js glue +
// wasm from the official core builds). Each core embeds a proven RetroArch
// frontend: it renders to a canvas we hand it, drives its own main loop and
// audio, and exposes a small C API — simulate_input (4-player, buttons 0-15 +
// stick axes 16-23), toggleMainLoop, system_restart, save states, SRAM.

import type { CoreButton, CoreTouch, CoreVideo, EmuCore } from './types'
import { RETRO_BUTTON_ID } from './types'
import type { PlatformDef } from './registry'

type EjsModule = {
  cwrap: (name: string, ret: string, args: string[]) => (...a: unknown[]) => unknown
  callMain: (args: string[]) => void
  FS: {
    writeFile: (path: string, data: Uint8Array) => void
    readFile: (path: string) => Uint8Array
    unlink: (path: string) => void
    analyzePath: (path: string) => { exists: boolean }
    mkdir: (path: string) => void
  }
  EmulatorJSGetState?: () => Uint8Array
  abort: () => void
  _simulate_input?: unknown
}

// mini-RetroArch input indexes (simulate_input)
const BTN_ID: Record<CoreButton, number> = RETRO_BUTTON_ID
const AXIS = { lxPos: 16, lxNeg: 17, lyPos: 18, lyNeg: 19, rxPos: 20, rxNeg: 21, ryPos: 22, ryNeg: 23 } as const

export interface CoreLoadResult {
  core: EjsCore | null
  error?: string
}

export class EjsCore implements EmuCore {
  readonly platform: string
  readonly fps: number
  readonly aspect: number
  readonly selfRender = true
  video: CoreVideo = { width: 320, height: 240, pixels: new Uint32Array(0) }

  private m: EjsModule | null = null
  private simulateInput: ((p: number, i: number, v: number) => void) | null = null
  private toggleMainLoop: ((v: number) => void) | null = null
  private systemRestart: (() => void) | null = null
  private saveSaveFiles: (() => void) | null = null
  private getSaveFilePath: (() => string) | null = null
  private lastButtons = new Map<string, boolean>()
  private lastAxes = new Map<string, number>()
  private romPath = '/game.rom'
  private running = true
  private touch: CoreTouch = { active: false, x: 0.5, y: 0.5 }

  private constructor(platform: string, fps: number, aspect: number) {
    this.platform = platform
    this.fps = fps
    this.aspect = aspect
  }

  static async load(def: PlatformDef, canvas: HTMLCanvasElement, wasmBase: string): Promise<CoreLoadResult> {
    const core = new EjsCore(def.id, def.fps, def.aspect)
    try {
      // 1. load the emscripten glue — it defines window.EJS_Runtime
      const glueUrl = `${wasmBase}${def.file}/${def.file}.js`
      const ok = await new Promise<boolean>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = glueUrl
        s.onload = () => resolve(true)
        s.onerror = () => reject(new Error(`core glue missing (${def.file})`))
        document.head.appendChild(s)
      })
      void ok
      const runtime = (window as unknown as { EJS_Runtime?: unknown }).EJS_Runtime
      if (typeof runtime !== 'function') return { core: null, error: 'core glue did not provide a runtime' }

      // 2. instantiate the wasm through the glue
      const wasmUrl = `${wasmBase}${def.file}/${def.file}.wasm`
      const init = runtime as (cfg: Record<string, unknown>) => Promise<EjsModule>
      const mod = await init({
        noInitialRun: true,
        canvas,
        print: () => {},
        printErr: () => {},
        locateFile: (f: string) => (f.endsWith('.wasm') ? wasmUrl : `${wasmBase}${def.file}/${f}`),
      })
      core.m = mod
      core.simulateInput = mod.cwrap('simulate_input', 'null', ['number', 'number', 'number']) as (p: number, i: number, v: number) => void
      core.toggleMainLoop = mod.cwrap('toggleMainLoop', 'null', ['number']) as (v: number) => void
      core.systemRestart = mod.cwrap('system_restart', '', []) as () => void
      core.saveSaveFiles = mod.cwrap('cmd_savefiles', '', []) as () => void
      core.getSaveFilePath = mod.cwrap('save_file_path', 'string', []) as () => string
      return { core }
    } catch (err) {
      return { core: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Write the ROM into the core's FS and boot the embedded frontend. */
  boot(rom: Uint8Array, ext: string): void {
    if (!this.m) throw new Error('core not instantiated')
    this.romPath = `/game.${ext}`
    this.m.FS.writeFile(this.romPath, rom)
    this.m.callMain([this.romPath])
  }

  // ---------- input (event-driven, change-filtered) ----------

  setButton(player: number, btn: CoreButton, down: boolean): void {
    if (!this.simulateInput) return
    const key = `${player}:${btn}`
    if (this.lastButtons.get(key) === down) return
    this.lastButtons.set(key, down)
    this.simulateInput(player - 1, BTN_ID[btn], down ? 1 : 0)
  }

  setAnalog(player: number, stick: 'lx' | 'ly' | 'rx' | 'ry', value: number): void {
    if (!this.simulateInput) return
    const pairs = { lx: [AXIS.lxPos, AXIS.lxNeg], ly: [AXIS.lyPos, AXIS.lyNeg], rx: [AXIS.rxPos, AXIS.rxNeg], ry: [AXIS.ryPos, AXIS.ryNeg] } as const
    const [pos, neg] = pairs[stick]
    const v = Math.max(-1, Math.min(1, value))
    const lastKey = `${player}:${stick}`
    if (this.lastAxes.get(lastKey) === v) return
    this.lastAxes.set(lastKey, v)
    const p = player - 1
    if (v > 0.08) {
      this.simulateInput(p, pos, Math.round(v * 0x7fff))
      this.simulateInput(p, neg, 0)
    } else if (v < -0.08) {
      this.simulateInput(p, pos, 0)
      this.simulateInput(p, neg, Math.round(-v * 0x7fff))
    } else {
      this.simulateInput(p, pos, 0)
      this.simulateInput(p, neg, 0)
    }
  }

  setTouch(player: number, x: number, y: number, down: boolean): void {
    this.touch = { active: down, x, y }
    void player
  }

  // ---------- lifecycle ----------

  runFrame(): void {
    // the embedded RetroArch loop runs on its own rAF — nothing to do here
  }

  setRunning(running: boolean): void {
    if (this.toggleMainLoop && this.running !== running) {
      this.running = running
      this.toggleMainLoop(running ? 1 : 0)
    }
  }

  reset(soft: boolean): void {
    if (soft) this.systemRestart?.()
    else this.systemRestart?.() // full hard reset = re-boot the whole core (costly); soft restart covers games
  }

  serialize(): string {
    const state = this.m?.EmulatorJSGetState?.()
    if (!state || state.length === 0) return ''
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < state.length; i += CHUNK) {
      bin += String.fromCharCode(...state.subarray(i, i + CHUNK))
    }
    return btoa(bin)
  }

  restore(data: string): boolean {
    if (!data || !this.m) return false
    try {
      const bin = atob(data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      try {
        this.m.FS.unlink('/game.state')
      } catch {
        /* not present */
      }
      this.m.FS.writeFile('/game.state', bytes)
      const loadState = this.m.cwrap('load_state', 'number', ['string', 'number'])
      loadState('/game.state', 0)
      setTimeout(() => {
        try {
          this.m?.FS.unlink('/game.state')
        } catch {
          /* ignore */
        }
      }, 2000)
      return true
    } catch {
      return false
    }
  }

  saveData(): Uint8Array | null {
    if (!this.m || !this.getSaveFilePath) return null
    try {
      this.saveSaveFiles?.()
      const path = this.getSaveFilePath()
      if (!path || !this.m.FS.analyzePath(path).exists) return null
      return this.m.FS.readFile(path)
    } catch {
      return null
    }
  }

  destroy(): void {
    try {
      this.toggleMainLoop?.(0)
      this.m?.abort()
    } catch {
      /* core already gone */
    }
  }
}
