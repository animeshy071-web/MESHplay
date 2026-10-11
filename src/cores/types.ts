// Unified emulator-core contract. Every core — built-in (CHIP-8, Game Boy)
// or bundled WASM (libretro) — implements this interface, so PlayView, the
// rewind engine, save states, the Game Bar and the input router are fully
// core-agnostic. Ports are 1..4: keyboard merges into P1, physical gamepads
// take ports in enumeration order, phone remotes take their pairing slot.

export type CoreButton =
  | 'b' | 'y' | 'select' | 'start'
  | 'up' | 'down' | 'left' | 'right'
  | 'a' | 'x' | 'l1' | 'r1' | 'l2' | 'r2' | 'l3' | 'r3'

export const CORE_BUTTONS: CoreButton[] = [
  'b', 'y', 'select', 'start', 'up', 'down', 'left', 'right',
  'a', 'x', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3',
]

/** libretro joypad IDs — the standard order every core expects. */
export const RETRO_BUTTON_ID: Record<CoreButton, number> = {
  b: 0, y: 1, select: 2, start: 3,
  up: 4, down: 5, left: 6, right: 7,
  a: 8, x: 9, l1: 10, r1: 11,
  l2: 12, r2: 13, l3: 14, r3: 15,
}

export interface CoreVideo {
  width: number
  height: number
  /** RGBA8, width*height pixels. Cores own the buffer; read per frame. */
  pixels: Uint32Array
}

export interface CoreTouch {
  active: boolean
  /** normalized 0..1 coordinates */
  x: number
  y: number
}

export interface EmuCore {
  readonly platform: string
  readonly video: CoreVideo
  /** native frames per second of the emulated machine */
  readonly fps: number
  readonly aspect: number
  /**
   * true when the core renders internally to a canvas it owns (mini-RetroArch
   * builds) — PlayView then skips its own framebuffer blit and frame pacing.
   */
  readonly selfRender?: boolean
  /** battery-backed SRAM (cartridge saves), or null */
  saveData(): Uint8Array | null
  setButton(player: number, btn: CoreButton, down: boolean): void
  setAnalog(player: number, stick: 'lx' | 'ly' | 'rx' | 'ry', value: number): void
  /** pointer/touch state (NDS touch, light guns) — normalized 0..1 */
  setTouch(player: number, x: number, y: number, down: boolean): void
  runFrame(): void
  reset(soft: boolean): void
  serialize(): string
  restore(data: string): boolean
  /** pause/resume cores that run their own internal loop */
  setRunning?(running: boolean): void
  /** CHIP-8-style square-wave beep level 0..1 (cores without APU output) */
  beep?(): number
  destroy?(): void
}

/** Keyboard defaults per platform — arrows + ZX/AS cluster, PS-style. */
export interface PlatformKeyMap {
  [code: string]: CoreButton
}

export const DEFAULT_KEYS: PlatformKeyMap = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyZ: 'b', KeyX: 'a', KeyA: 'y', KeyS: 'x',
  KeyQ: 'l1', KeyE: 'r1', KeyR: 'l2', KeyT: 'r2',
  Enter: 'start', ShiftRight: 'select', ShiftLeft: 'select',
}
