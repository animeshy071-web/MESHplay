// Libretro frontend in TypeScript — loads stock libretro cores (compiled to
// WebAssembly) and drives them through the standard retro_* ABI: environment
// negotiation, XRGB1555/XRGB8888/RGB565 video, audio sample batches, 4-port
// input, save-state serialization and battery SRAM. Cores ship inside the
// app bundle (public/cores/) — users never install anything.

import type { CoreButton, CoreTouch, CoreVideo, EmuCore } from './types'
import { RETRO_BUTTON_ID } from './types'
import { coreInputButton, coreInputAxis, corePollInput } from './inputRouter'
import { PLATFORM_BY_ID } from './registry'

// ---------- libretro constants ----------
const ENV_SET_PIXEL_FORMAT = 10
const ENV_SET_SUPPORT_ACHIEVEMENTS = 66
const ENV_GET_LOG_INTERFACE = 27
const ENV_GET_PERF_INTERFACE = 42
const ENV_GET_SYSTEM_DIRECTORY = 48
const ENV_GET_SAVE_DIRECTORY = 49
const ENV_SHUTDOWN = 54
const ENV_GET_VARIABLE = 15
const ENV_SET_MESSAGE = 6
const ENV_SET_MESSAGE_EXT = 59

const PIXEL_XRGB1555 = 0
const PIXEL_XRGB8888 = 1
const PIXEL_RGB565 = 2

const DEVICE_NONE = 0
const DEVICE_JOYPAD = 1
const DEVICE_ANALOG = 5
const DEVICE_POINTER = 7

// retro_variable: { const char* key; const char* value; }
class WasmStringReader {
  constructor(private mem: ArrayBuffer) {}
  cstr(ptr: number): string {
    const u8 = new Uint8Array(this.mem)
    let end = ptr
    while (end < u8.length && u8[end] !== 0) end++
    return new TextDecoder().decode(u8.subarray(ptr, end))
  }
}

class AudioRing {
  private buf = new Float32Array(1 << 16) // 64k samples ≈ 0.68s @48k
  private w = 0
  private r = 0
  readonly sampleRate = 48000

  push(pairs: Float32Array): void {
    for (let i = 0; i < pairs.length; i++) {
      const next = (this.w + 1) % this.buf.length
      if (next === this.r) break // overflow: drop (audio staleness beats noise)
      this.buf[this.w] = pairs[i]
      this.w = next
    }
  }
  pull(out: Float32Array): number {
    let n = 0
    while (n < out.length && this.r !== this.w) {
      out[n] = this.buf[this.r]
      this.r = (this.r + 1) % this.buf.length
      n++
    }
    return n
  }
  clear(): void {
    this.r = this.w = 0
  }
}

export interface CoreLoadResult {
  core: LibretroCore | null
  error?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// wasm-glue boundary: core callbacks arrive as untyped (i32...) invocations

export class LibretroCore implements EmuCore {
  readonly platform: string
  video: CoreVideo = { width: 320, height: 240, pixels: new Uint32Array(320 * 240) }
  fps = 60
  aspect = 4 / 3

  private ex: Record<string, any> = {}
  private mem: WebAssembly.Memory | null = null
  private fnIdx: Record<string, number> = {}
  private pixelFormat = PIXEL_XRGB1555
  private sampleRate = 48000
  private romBytes: Uint8Array | null = null
  private loaded = false
  private shutdown = false
  readonly audio = new AudioRing()
  private touches = new Map<number, CoreTouch>()
  private sysDir = 'system'
  private tmpPath = 'game.rom'
  private needFullpath = false
  private gamePathPtr = 0

  private constructor(platform: string) {
    this.platform = platform
  }

  // ---------- loading ----------

  static async load(platformId: string, wasmUrl: string): Promise<CoreLoadResult> {
    const core = new LibretroCore(platformId)
    try {
      const resp = await fetch(wasmUrl)
      if (!resp.ok) return { core: null, error: `core binary missing (${resp.status})` }
      const bytes = new Uint8Array(await resp.arrayBuffer())
      const module = await WebAssembly.compile(bytes)

      // satisfy imports by name-pattern — stock cores import the libretro
      // callback set plus a handful of libc/emscripten shims
      const imports: Record<string, Record<string, any>> = {}
      const wanted = WebAssembly.Module.imports(module)
      let memoryImport: { module: string; name: string } | null = null
      for (const im of wanted) {
        imports[im.module] ??= {}
        const name = im.name.toLowerCase()
        if (im.kind === 'memory') {
          memoryImport = { module: im.module, name: im.name }
          continue
        }
        if (im.kind !== 'function') {
          imports[im.module][im.name] = new WebAssembly.Global({ value: 'i32', mutable: false }, 0)
          continue
        }
        imports[im.module][im.name] = core.importFor(im.name)
      }
      if (memoryImport) {
        imports[memoryImport.module][memoryImport.name] = new WebAssembly.Memory({ initial: 512, maximum: 4096 })
      }

      const instance = await WebAssembly.instantiate(module, imports as WebAssembly.Imports)
      core.ex = instance.exports as typeof core.ex
      const memExport = core.ex['memory'] ?? core.ex['mem']
      if (memExport instanceof WebAssembly.Memory) core.mem = memExport
      else if (memoryImport) core.mem = imports[memoryImport.module][memoryImport.name] as WebAssembly.Memory
      if (!core.mem) return { core: null, error: 'core exports no linear memory' }

      core.wireCallbacks()
      core.call('retro_set_environment', core.fnIdx.environment)
      core.call('retro_set_video_refresh', core.fnIdx.video)
      core.call('retro_set_audio_sample', core.fnIdx.audio)
      core.call('retro_set_audio_sample_batch', core.fnIdx.audioBatch)
      core.call('retro_set_input_poll', core.fnIdx.inputPoll)
      core.call('retro_set_input_state', core.fnIdx.inputState)
      core.call('retro_init')
      return { core }
    } catch (err) {
      return { core: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Map an arbitrary import name to a JS implementation (pattern-matched). */
  private importFor(name: string): (...args: any[]) => any {
    const n = name.toLowerCase()
    if (/environment|environ_cb/.test(n)) return (cmd: number, data: number) => (this.envCallback(cmd, data) ? 1 : 0)
    if (/video_refresh|video_cb/.test(n)) return (data: number, w: number, h: number, pitch: number) => this.videoRefresh(data, w, h, pitch)
    if (/audio_sample_batch/.test(n)) return (ptr: number, frames: number) => this.audioBatch(ptr, frames)
    if (/audio_sample\b|audio_sample_cb/.test(n)) return (l: number, r: number) => this.audioSample(l, r)
    if (/input_poll/.test(n)) return () => corePollInput()
    if (/input_state/.test(n)) return (port: number, dev: number, idx: number, id: number) => this.inputState(port, dev, idx, id)
    if (/memcpy_big|emscripten_memcpy/.test(n)) {
      return (dest: number, src: number, num: number) => {
        const u8 = new Uint8Array(this.mem!.buffer)
        u8.copyWithin(dest, src, src + num)
        return dest
      }
    }
    if (/get_temp_ret|set_temp_ret/.test(n)) return () => 0
    if (/get_now|emscripten_get_now|clock_gettime|gettimeofday/.test(n)) return () => performance.now()
    if (/strftime|localtime_r|gmtime/.test(n)) return () => 0
    if (/log|emscripten_log|console/.test(n)) return () => {}
    if (/abort|emscripten_abort/.test(n)) {
      return (msg?: unknown) => {
        throw new Error(`core abort: ${String(msg)}`)
      }
    }
    if (/invoke_|dynCall/.test(n)) return () => {} // exception-less stubs
    // unknown import: tolerant stub that returns 0 (logged once by load)
    return () => 0
  }

  /** Reserve a wasm function-table slot for a JS callback. */
  private allocFn(fn: (...args: any[]) => any): number {
    const table = this.ex['table'] ?? this.ex['__indirect_function_table']
    if (!(table instanceof WebAssembly.Table)) throw new Error('core exports no function table')
    try {
      const idx = table.grow(1)
      table.set(idx, fn)
      return idx
    } catch {
      // table capped — find an unused slot (cores rarely fill the whole table)
      for (let i = table.length - 1; i > 0; i--) {
        if (table.get(i) == null) {
          table.set(i, fn)
          return i
        }
      }
      throw new Error('core function table exhausted')
    }
  }

  private wireCallbacks(): void {
    this.fnIdx.environment = this.allocFn((cmd: number, data: number) => (this.envCallback(cmd, data) ? 1 : 0))
    this.fnIdx.video = this.allocFn((data: number, w: number, h: number, pitch: number) => this.videoRefresh(data, w, h, pitch))
    this.fnIdx.audio = this.allocFn((l: number, r: number) => this.audioSample(l, r))
    this.fnIdx.audioBatch = this.allocFn((ptr: number, frames: number) => this.audioBatch(ptr, frames))
    this.fnIdx.inputPoll = this.allocFn(() => corePollInput())
    this.fnIdx.inputState = this.allocFn((port: number, dev: number, idx: number, id: number) => this.inputState(port, dev, idx, id))
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  private call<T = unknown>(name: string, ...args: unknown[]): T {
    const fn = this.ex[name]
    if (typeof fn !== 'function') throw new Error(`core missing export ${name}`)
    return (fn as (...a: unknown[]) => T)(...args)
  }

  private malloc(bytes: number): number {
    const m = this.ex['malloc'] ?? this.ex['_malloc'] ?? this.ex['emscripten_malloc']
    if (typeof m !== 'function') throw new Error('core exports no malloc')
    return (m as (n: number) => number)(bytes)
  }

  private writeCStr(s: string): number {
    const bytes = new TextEncoder().encode(s + '\0')
    const ptr = this.malloc(bytes.length)
    new Uint8Array(this.mem!.buffer).set(bytes, ptr)
    return ptr
  }

  // ---------- environment ----------

  private envCallback(cmd: number, data: number): boolean {
    switch (cmd) {
      case ENV_SET_PIXEL_FORMAT: {
        this.pixelFormat = new Int32Array(this.mem!.buffer, data, 1)[0]
        return true
      }
      case ENV_GET_SYSTEM_DIRECTORY:
      case ENV_GET_SAVE_DIRECTORY: {
        try {
          const ptr = this.writeCStr(this.sysDir)
          new Int32Array(this.mem!.buffer, data, 1)[0] = ptr
          return true
        } catch {
          return false
        }
      }
      case ENV_SET_SUPPORT_ACHIEVEMENTS:
        return false // RetroAchievements bridge attaches at Game Bar level
      case ENV_GET_LOG_INTERFACE:
      case ENV_GET_PERF_INTERFACE:
        return false
      case ENV_GET_VARIABLE:
        return false // stock defaults; per-core tuning lands in Settings later
      case ENV_SET_MESSAGE:
      case ENV_SET_MESSAGE_EXT:
        return false
      case ENV_SHUTDOWN:
        this.shutdown = true
        return true
      default:
        return false // HW render, overlays, discord, netplay … all politely declined
    }
  }

  // ---------- AV callbacks ----------

  private videoRefresh(data: number, w: number, h: number, pitch: number): void {
    if (!data || w <= 0 || h <= 0) return
    if (this.video.width !== w || this.video.height !== h) {
      this.video = { width: w, height: h, pixels: new Uint32Array(w * h) }
    }
    const view = new DataView(this.mem!.buffer)
    const out = this.video.pixels
    const bytesPerPx = this.pixelFormat === PIXEL_XRGB8888 ? 4 : 2
    const stride = pitch >> 2 // pixels per row (pitch is bytes)
    for (let y = 0; y < h; y++) {
      const rowBase = data + y * (stride << 2)
      let o = y * w
      if (bytesPerPx === 4) {
        for (let x = 0; x < w; x++) {
          const c = view.getUint32(rowBase + (x << 2), true) // XRGB8888 → RGBA
          out[o++] = ((c & 0xff00ff00) | ((c & 0x00ff0000) >> 16) | ((c & 0x000000ff) << 16)) >>> 0
        }
      } else {
        for (let x = 0; x < w; x++) {
          const c = view.getUint16(rowBase + (x << 1), true)
          if (this.pixelFormat === PIXEL_RGB565) {
            const r5 = (c >> 11) & 0x1f, g6 = (c >> 5) & 0x3f, b5 = c & 0x1f
            out[o++] = (0xff000000 | (b5 << 19) | (g6 << 10) | (r5 << 3)) >>> 0
          } else {
            const r5 = (c >> 10) & 0x1f, g5 = (c >> 5) & 0x1f, b5 = c & 0x1f
            out[o++] = (0xff000000 | (b5 << 19) | (g5 << 11) | (r5 << 3)) >>> 0
          }
        }
      }
    }
  }

  private audioBatch(ptr: number, frames: number): number {
    if (!ptr || frames <= 0) return 0
    const pairs = new Float32Array(this.mem!.buffer, ptr, frames * 2)
    this.audio.push(pairs)
    return frames
  }

  private audioSample(l: number, r: number): void {
    const pair = new Float32Array([l, r])
    this.audio.push(pair)
  }

  private inputState(port: number, device: number, index: number, id: number): number {
    if (device === DEVICE_JOYPAD) {
      const btn = BUTTON_BY_ID[id]
      return btn && coreInputButton(port + 1, btn) ? 1 : 0
    }
    if (device === DEVICE_ANALOG && index <= 1) {
      const stick = index === 0 ? ('lx' as const) : ('rx' as const)
      const axis = id === 0 ? stick : (stick === 'lx' ? 'ly' : 'ry')
      return Math.round(coreInputAxis(port + 1, axis) * 0x7fff)
    }
    if (device === DEVICE_POINTER) {
      const t = this.touches.get(port + 1)
      if (!t?.active) return 0
      if (id === RETRO_DEVICE_ID_POINTER_X) return Math.round(t.x * 0x7fff)
      if (id === RETRO_DEVICE_ID_POINTER_Y) return -Math.round(t.y * 0x7fff)
      if (id === RETRO_DEVICE_ID_POINTER_PRESSED) return 1
      return 0
    }
    return 0
  }

  setTouch(player: number, x: number, y: number, down: boolean): void {
    this.touches.set(player, { active: down, x, y })
  }

  // inputs are pulled synchronously inside input_state (see inputRouter) —
  // the EmuCore push API is a no-op for libretro cores
  setButton(): void {}
  setAnalog(): void {}

  // ---------- lifecycle ----------

  loadGame(rom: Uint8Array, saveData: Uint8Array | null, tmpRealPath: string | null): void {
    this.romBytes = rom
    // retro_system_info { library_name, library_version, valid_extensions, need_fullpath, block_extract }
    const sysPtr = this.malloc(16)
    this.call('retro_get_system_info', sysPtr)
    const rd = new WasmStringReader(this.mem!.buffer)
    const exts = rd.cstr(new Int32Array(this.mem!.buffer, sysPtr + 8, 1)[0])
    this.needFullpath = new Uint8Array(this.mem!.buffer, sysPtr + 12, 1)[0] === 1
    void exts

    // retro_game_info { path, data, size, meta }
    const info = this.malloc(16)
    this.gamePathPtr = this.writeCStr(tmpRealPath ?? this.tmpPath)
    let dataPtr = 0
    let size = rom.length
    if (this.needFullpath) {
      if (!tmpRealPath) throw new Error('this core needs real files on disk (zip/disc images)')
      size = 0
      dataPtr = 0
    } else {
      dataPtr = this.malloc(rom.length)
      new Uint8Array(this.mem!.buffer).set(rom, dataPtr)
    }
    const info32 = new Int32Array(this.mem!.buffer, info, 4)
    info32[0] = this.gamePathPtr
    info32[1] = dataPtr
    info32[2] = size
    info32[3] = 0

    if (!this.call<boolean>('retro_load_game', info)) throw new Error('core refused the ROM')

    // av info { geometry { w,h,max_w,max_h,aspect }, timing { fps, sample_rate } }
    const av = this.malloc(36)
    this.call('retro_get_system_av_info', av)
    const av32 = new Int32Array(this.mem!.buffer, av, 9)
    const avf = new Float64Array(this.mem!.buffer, av)
    this.video = { width: av32[0], height: av32[1], pixels: new Uint32Array(av32[0] * av32[1]) }
    this.aspect = avf[5] > 0 ? avf[5] : av32[0] / av32[1]
    this.fps = avf[6] > 0 ? avf[6] : 60
    this.sampleRate = avf[7] > 0 ? avf[7] : 48000

    // connect 4 joypad ports (P1–P4: keyboard, gamepads, phone remotes)
    for (let p = 0; p < 4; p++) {
      this.call('retro_set_controller_port_device', p, DEVICE_JOYPAD)
    }
    void DEVICE_NONE
    this.loaded = true
    void saveData // SRAM is read from core memory on demand (see saveData())
  }

  runFrame(): void {
    if (!this.loaded) return
    this.call('retro_run')
  }

  reset(soft: boolean): void {
    if (soft) this.call('retro_reset')
    else {
      this.call('retro_deinit')
      this.call('retro_init')
      if (this.romBytes) this.loadGame(this.romBytes, null, this.needFullpath ? this.tmpRealPathCached : null)
    }
  }
  private tmpRealPathCached: string | null = null

  serialize(): string {
    const size = this.call<number>('retro_serialize_size')
    if (!size) return ''
    const ptr = this.malloc(size)
    if (!this.call<boolean>('retro_serialize', ptr, size)) return ''
    const bytes = new Uint8Array(this.mem!.buffer, ptr, size)
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    return btoa(bin)
  }

  restore(data: string): boolean {
    if (!data) return false
    const bin = atob(data)
    const size = this.call<number>('retro_serialize_size')
    if (bin.length !== size) return false
    const ptr = this.malloc(size)
    const bytes = new Uint8Array(this.mem!.buffer, ptr, size)
    for (let i = 0; i < size; i++) bytes[i] = bin.charCodeAt(i)
    return this.call<boolean>('retro_unserialize', ptr, size)
  }

  /** Battery-backed cartridge SRAM straight from core memory. */
  saveData(): Uint8Array | null {
    try {
      const ptr = this.call<number>('retro_get_memory_data', 0) // RETRO_MEMORY_SAVE_RAM
      const size = this.call<number>('retro_get_memory_size', 0)
      if (!ptr || !size) return null
      return new Uint8Array(this.mem!.buffer.slice(ptr, ptr + size))
    } catch {
      return null
    }
  }

  destroy(): void {
    try {
      this.call('retro_deinit')
    } catch {
      /* core already gone */
    }
  }
}

const BUTTON_BY_ID: (CoreButton | undefined)[] = []
for (const [btn, id] of Object.entries(RETRO_BUTTON_ID)) BUTTON_BY_ID[id] = btn as CoreButton

const RETRO_DEVICE_ID_POINTER_X = 0
const RETRO_DEVICE_ID_POINTER_Y = 1
const RETRO_DEVICE_ID_POINTER_PRESSED = 2

void PLATFORM_BY_ID
