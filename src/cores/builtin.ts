// Built-in cores (CHIP-8, Game Boy) adapted to the unified EmuCore contract,
// so PlayView never branches on core type again.

import { Chip8 } from '../chip8/core'
import { GameBoy, GB_H, GB_W, type GbButton } from '../gb/gb'
import type { CoreButton, CoreVideo, EmuCore } from './types'

const GB_BTN: Record<GbButton, CoreButton> = {
  right: 'right', left: 'left', up: 'up', down: 'down',
  a: 'a', b: 'b', select: 'select', start: 'start',
}

class Chip8Core implements EmuCore {
  readonly platform = 'chip8'
  readonly fps = 60
  readonly aspect = 2
  video: CoreVideo = { width: 64, height: 32, pixels: new Uint32Array(64 * 32) }
  private core: Chip8 | null = null

  attach(core: Chip8): void {
    this.core = core
  }

  setButton(_player: number, btn: CoreButton, down: boolean): void {
    const c = this.core
    if (!c) return
    const chip = CHIP_BTN[btn]
    if (chip !== undefined) c.keys[chip] = down ? 1 : 0
  }

  setAnalog(): void {} // CHIP-8 is digital

  setTouch(): void {}

  runFrame(): void {
    const c = this.core
    if (!c) return
    for (let j = 0; j < 11; j++) c.cycle()
    c.tickTimers()
    if (c.drawFlag) {
      const px = this.video.pixels
      for (let i = 0; i < 64 * 32; i++) px[i] = c.display[i] ? 0xffffffff : 0xff000000
      c.drawFlag = false
    }
  }

  beep(): number {
    return this.core?.soundOn ? 0.35 : 0
  }

  serialize(): string {
    return this.core?.serialize() ?? ''
  }

  restore(data: string): boolean {
    try {
      this.core?.restore(data)
      return true
    } catch {
      return false
    }
  }

  saveData(): Uint8Array | null {
    return null
  }

  reset(): void {
    void this.core // rebuild handled by PlayView (needs the ROM bytes)
  }

  destroy(): void {}
}

const CHIP_BTN: Partial<Record<CoreButton, number>> = {
  a: 0x0, b: 0xf, x: 0x1, y: 0x4,
  right: 0x5, down: 0x8, left: 0x7, up: 0x2,
  start: 0xc, select: 0xd,
}

class GameBoyCore implements EmuCore {
  readonly platform = 'gb'
  readonly fps = 59.73
  readonly aspect = GB_W / GB_H
  video: CoreVideo = { width: GB_W, height: GB_H, pixels: new Uint32Array(GB_W * GB_H) }
  private core: GameBoy | null = null

  attach(core: GameBoy): void {
    this.core = core
    core.apu.attachAudio()
    core.onFrame = () => {
      const fb = core.ppu.framebuffer
      const px = this.video.pixels
      for (let i = 0; i < GB_W * GB_H; i++) {
        const c = fb[i]
        px[i] = (0xff000000 | (c & 0xff00) | ((c >> 16) & 0xff) | ((c & 0xff) << 16)) >>> 0
      }
    }
  }

  get inner(): GameBoy | null {
    return this.core
  }

  setButton(_player: number, btn: CoreButton, down: boolean): void {
    const gb = (GB_BTN as Record<string, GbButton | undefined>)[btn]
    if (gb) this.core?.setButton(gb, down)
  }

  setAnalog(): void {} // GB is digital

  setTouch(): void {}

  runFrame(): void {
    this.core?.runFrame()
  }

  beep(): number {
    return 0 // GB core outputs real audio through its own APU
  }

  serialize(): string {
    return this.core?.serialize() ?? ''
  }

  restore(data: string): boolean {
    return this.core?.restore(data) ?? false
  }

  saveData(): Uint8Array | null {
    return this.core?.cart.ram ?? null
  }

  reset(): void {
    void this.core
  }

  destroy(): void {
    this.core?.apu.detachAudio()
  }
}

export { Chip8Core, GameBoyCore }