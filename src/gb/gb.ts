// Game Boy system: bus, timer, joypad, DMA, interrupt dispatch, frame loop,
// full state serialization (save states + rewind). Ships a zero-asset
// built-in demo ROM (hand-assembled bouncing sprite) so the core is testable
// without shipping any copyrighted binaries.

import { SM83 } from './cpu'
import { Cartridge } from './cart'
import { Ppu, GB_W, GB_H } from './ppu'
import { Apu } from './apu'

const T_CYCLES_PER_FRAME = 70224 // 59.7275 Hz

export type GbButton = 'right' | 'left' | 'up' | 'down' | 'a' | 'b' | 'select' | 'start'

export class GameBoy {
  cpu: SM83
  cart: Cartridge
  ppu = new Ppu()
  apu = new Apu()

  // memory
  wram = new Uint8Array(0x2000)
  hram = new Uint8Array(0x80)
  ie = 0

  // timer
  private divCounter = 0
  tima = 0
  tma = 0
  tac = 0

  // joypad: bit set = not pressed (active low)
  private joyp = 0x0f
  private buttons = 0 // bit0 A, 1 B, 2 Select, 3 Start
  private dpad = 0 // bit0 Right, 1 Left, 2 Up, 3 Down

  onFrame: ((fb: Uint32Array) => void) | null = null
  private pendingFrame = false

  constructor(rom: Uint8Array, saveData?: Uint8Array | null) {
    this.cart = new Cartridge(rom, saveData)
    this.cpu = new SM83({
      read: (a) => this.read(a),
      write: (a, v) => this.write(a, v),
    })
    // skip the boot ROM: set post-boot register state (DMG)
    this.cpu.a = 0x01
    this.cpu.f = 0xb0
    this.cpu.b = 0x00
    this.cpu.c = 0x13
    this.cpu.d = 0x00
    this.cpu.e = 0xd8
    this.cpu.h = 0x01
    this.cpu.l = 0x4d
    this.cpu.sp = 0xfffe
    this.cpu.pc = 0x0100
    this.ppu.busRead = (a) => this.read(a)
    this.ppu.vblankCallback = () => {
      this.pendingFrame = true
    }
  }

  // ---------- bus ----------
  read(addr: number): number {
    addr &= 0xffff
    if (addr < 0x8000) return this.cart.read(addr)
    if (addr < 0xa000) return this.ppu.read(addr)
    if (addr < 0xc000) return this.cart.read(addr)
    if (addr < 0xe000) return this.wram[addr - 0xc000]
    if (addr < 0xfe00) return this.wram[addr - 0xe000] // echo RAM
    if (addr < 0xff00) return this.ppu.read(addr)
    return this.readIo(addr)
  }

  private readIo(addr: number): number {
    switch (addr) {
      case 0xff00: return 0xc0 | this.joyp
      case 0xff04: return (this.divCounter >> 8) & 0xff
      case 0xff05: return this.tima
      case 0xff06: return this.tma
      case 0xff07: return this.tac | 0xf8
      case 0xff0f: return 0xe0 | this.iflags
      case 0xffff: return this.ie
      default:
        if (addr >= 0xff40 && addr <= 0xff4b) return this.ppu.read(addr)
        if (addr >= 0xff10 && addr < 0xff40) return this.apu.read(addr)
        if (addr >= 0xff80) return this.hram[addr - 0xff80]
        return 0xff
    }
  }

  write(addr: number, v: number): void {
    addr &= 0xffff
    v &= 0xff
    if (addr < 0x8000) {
      this.cart.write(addr, v)
      return
    }
    if (addr < 0xa000) {
      this.ppu.write(addr, v)
      return
    }
    if (addr < 0xc000) {
      this.cart.write(addr, v)
      return
    }
    if (addr < 0xe000) {
      this.wram[addr - 0xc000] = v
      return
    }
    if (addr < 0xfe00) {
      this.wram[addr - 0xe000] = v
      return
    }
    if (addr < 0xff00) {
      this.ppu.write(addr, v)
      return
    }
    this.writeIo(addr, v)
  }

  private dmaReg = 0

  private writeIo(addr: number, v: number): void {
    switch (addr) {
      case 0xff00: // JOYP
        // top two bits are read/write selection
        {
          const selectAction = (v & 0x20) === 0
          const selectDir = (v & 0x10) === 0
          let low = 0x0f
          if (selectDir) low &= ~this.dpad & 0x0f
          if (selectAction) low &= ~this.buttons & 0x0f
          this.joyp = (this.joyp & 0x30) | low
        }
        break
      case 0xff04: this.divCounter = 0; break // DIV reset
      case 0xff05: this.tima = v; break
      case 0xff06: this.tma = v; break
      case 0xff07: this.tac = v & 0x07; break
      case 0xff0f: this.iflags = v & 0x1f; break
      case 0xff46: // OAM DMA
        this.dmaReg = v
        this.ppu.dmaWrite(v)
        break
      case 0xffff: this.ie = v; break
      default:
        if (addr >= 0xff40 && addr <= 0xff4b) {
          this.ppu.write(addr, v)
        } else if (addr >= 0xff10 && addr < 0xff40) {
          this.apu.write(addr, v)
        } else if (addr >= 0xff80) {
          this.hram[addr - 0xff80] = v
        }
        break
    }
  }

  private iflags = 0xe1

  // ---------- input ----------
  setButton(btn: GbButton, down: boolean): void {
    const map: Record<GbButton, { reg: 'buttons' | 'dpad'; bit: number }> = {
      a: { reg: 'buttons', bit: 0 },
      b: { reg: 'buttons', bit: 1 },
      select: { reg: 'buttons', bit: 2 },
      start: { reg: 'buttons', bit: 3 },
      right: { reg: 'dpad', bit: 0 },
      left: { reg: 'dpad', bit: 1 },
      up: { reg: 'dpad', bit: 2 },
      down: { reg: 'dpad', bit: 3 },
    }
    const m = map[btn]
    const reg = m.reg
    if (down) {
      this[reg] |= 1 << m.bit
      // joypad interrupt on press
      this.iflags |= 0x10
    } else {
      this[reg] &= ~(1 << m.bit)
    }
  }

  // ---------- run ----------
  /** Runs one video frame. Returns true if a new frame is ready. */
  runFrame(): boolean {
    this.pendingFrame = false
    let cycles = 0
    while (cycles < T_CYCLES_PER_FRAME) {
      const c = this.cpu.step()
      cycles += c
      this.ppu.tick(c, (bit) => {
        this.iflags |= 1 << bit
      })
      this.apu.tick(c)
      this.tickTimer(c)
    }
    if (this.pendingFrame) {
      this.onFrame?.(this.ppu.framebuffer)
      return true
    }
    return false
  }

  private tickTimer(cycles: number): void {
    this.divCounter = (this.divCounter + cycles) & 0xffff
    if (!(this.tac & 0x04)) return
    const threshold = [1024, 16, 64, 256][this.tac & 3]
    this.timerAcc += cycles
    while (this.timerAcc >= threshold) {
      this.timerAcc -= threshold
      this.tima++
      if (this.tima > 0xff) {
        this.tima = this.tma
        this.iflags |= 0x04 // timer interrupt
      }
    }
  }
  private timerAcc = 0

  /** True when the display is powered (used for screen-off rendering). */
  get lcdOn(): boolean {
    return (this.ppu.lcdc & 0x80) !== 0
  }

  title(): string {
    let t = ''
    for (let i = 0x134; i <= 0x143; i++) {
      const ch = this.cart.rom[i]
      if (ch === 0 || ch === 0x80 || ch === 0xc8) break
      t += String.fromCharCode(ch)
    }
    return t.trim() || 'GAME BOY'
  }

  // ---------- save states + rewind ----------
  serialize(): string {
    return JSON.stringify({
      v: 2,
      cpu: this.cpu.serialize(),
      ppu: this.ppu.serialize(),
      apu: this.apu.serialize(),
      wram: Array.from(this.wram),
      hram: Array.from(this.hram),
      ie: this.ie,
      iflags: this.iflags,
      divCounter: this.divCounter,
      tima: this.tima,
      tma: this.tma,
      tac: this.tac,
      romBank: this.cart.romBank,
      ramBank: this.cart.ramBank,
      ramEnabled: this.cart.ramEnabled,
    })
  }

  restore(json: string): boolean {
    try {
      const s = JSON.parse(json) as Record<string, unknown>
      if (s.v !== 2) return false
      if (!this.cpu.restore(s.cpu as string)) return false
      this.ppu.restore(s.ppu as Record<string, unknown>)
      this.apu.restore(s.apu as Record<string, unknown>)
      const arr = (v: unknown, len: number): Uint8Array<ArrayBuffer> => {
        const a = new Uint8Array(len)
        if (Array.isArray(v)) {
          for (let i = 0; i < Math.min(len, v.length); i++) a[i] = v[i] as number
        }
        return a
      }
      this.wram = arr(s.wram, 0x2000)
      this.hram = arr(s.hram, 0x80)
      this.ie = s.ie as number
      this.iflags = s.iflags as number
      this.divCounter = s.divCounter as number
      this.tima = s.tima as number
      this.tma = s.tma as number
      this.tac = s.tac as number
      this.cart.romBank = s.romBank as number
      this.cart.ramBank = s.ramBank as number
      this.cart.ramEnabled = s.ramEnabled as boolean
      return true
    } catch {
      return false
    }
  }
}

export { GB_W, GB_H }

// ---------- built-in demo ROM (zero assets) ----------

/**
 * Hand-assembled DMG ROM: bouncing ball + sound blip on bounce.
 * Boot ROM skipped (pc set to 0x100); header filled with plausible values.
 * Written with a label-based emitter so every jump resolves cleanly.
 */
export function buildDemoRom(): Uint8Array {
  const rom = new Uint8Array(0x8000)

  // header
  rom.set([0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
    0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e, 0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 0xd9, 0x99,
    0xbb, 0xbb, 0x67, 0x63, 0x6e, 0x0e, 0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 0x33, 0x3e], 0x104)
  rom.set([0x4d, 0x45, 0x53, 0x48, 0x44, 0x45, 0x4d, 0x4f], 0x134) // "MESHDEMO"
  rom[0x147] = 0x00 // no MBC
  rom[0x148] = 0x00
  rom[0x149] = 0x00

  // ---- tiny label-based emitter ----
  const org: number[] = []
  const labels: Record<string, number> = {}
  const fixups: Array<{ pos: number; label: string; size: number }> = []
  const emit = (...bytes: number[]) => {
    for (const b of bytes) org.push(b & 0xff)
  }
  const label = (name: string) => {
    labels[name] = org.length
  }
  const jr = (cond: number | null, targetLabel: string) => {
    // cond: null = JR (0x18), else JR cc opcode (0x20/0x28/0x30/0x38)
    emit(cond ?? 0x18, 0)
    fixups.push({ pos: org.length - 1, label: targetLabel, size: 1 })
  }
  const jp = (targetLabel: string) => {
    // absolute JP — no ±127 range limit
    emit(0xc3, 0, 0)
    fixups.push({ pos: org.length - 1, label: targetLabel, size: 2 })
  }

  // A + B + D + E + H + L are used as scratch in tight blocks below.
  // HRAM layout: FF80 = X, FF81 = Y, FF82 = DX, FF83 = DY, FF84 = prevX, FF85 = prevY

  // 0x100: NOP + JP main — the program body must live AFTER the cartridge
  // header (0x104-0x14F contains the logo/title/checksums).
  emit(0x00)
  jp('main')
  while (org.length < 0x50) org.push(0x00) // pad to 0x150
  label('main')

  label('init')
  emit(0x3e, 0x93) // LD A, 0x93 → LCDC: LCD on, BG+OBJ on, tiles 8000, map 9800
  emit(0xe0, 0x40) // LDH (40), A
  emit(0x3e, 0xe4) // LD A, 0xE4
  emit(0xe0, 0x47) // BGP
  emit(0xe0, 0x48) // OBP0
  // ball tile (tile index 1) at VRAM 0x8010: 8 rows of (lo, hi)
  emit(0x21, 0x10, 0x80) // LD HL, 0x8010
  for (const r of [0x18, 0x3c, 0x7e, 0xff, 0xff, 0x7e, 0x3c, 0x18]) {
    emit(0x3e, r) // LD A, r
    emit(0x77) // LD (HL), A
    emit(0x23) // INC HL
    emit(0x77) // LD (HL), A
    emit(0x23) // INC HL
  }
  // position vars
  emit(0x3e, 0x10) // LD A, 16
  emit(0xe0, 0x80) // X = 16
  emit(0x3e, 0x18) // LD A, 24
  emit(0xe0, 0x81) // Y = 24
  emit(0x3e, 0x01) // LD A, 1
  emit(0xe0, 0x82) // DX = 1
  emit(0x3e, 0x01)
  emit(0xe0, 0x83) // DY = 1
  emit(0xaf) // XOR A
  emit(0xe0, 0x84) // prevX = 0
  emit(0xe0, 0x85) // prevY = 0

  label('loop')
  // wait for VBlank (LY == 144)
  label('waitVb')
  emit(0xf0, 0x44) // LDH A, (44)  — LY
  emit(0xfe, 0x90) // CP 0x90
  jr(0x20, 'waitVb') // JR NZ

  // clear previous cell: map[0x9800 + (prevY>>3)*32 + (prevX>>3)] = 0
  emit(0xf0, 0x84) // LDH A,(84) prevX
  emit(0x47) // LD B, A
  emit(0xf0, 0x85) // LDH A,(85) prevY
  emit(0x4f) // LD C, A
  emit(0x78) // LD A, B
  emit(0xb1) // OR C
  jr(0x28, 'afterClear') // JR Z (first frame)
  emit(0x78) // LD A, B
  emit(0xcb, 0x3f) // SRL A
  emit(0xcb, 0x3f)
  emit(0xcb, 0x3f) // A = prevX >> 3
  emit(0x5f) // LD E, A
  emit(0x79) // LD A, C
  emit(0xcb, 0x3f)
  emit(0xcb, 0x3f)
  emit(0xcb, 0x3f) // A = prevY >> 3
  emit(0x6f) // LD L, A
  emit(0x26, 0x00) // LD H, 0
  emit(0x29) // ADD HL, HL
  emit(0x29)
  emit(0x29)
  emit(0x29)
  emit(0x29) // HL = (prevY>>3)*32
  emit(0x7b) // LD A, E
  emit(0x85) // ADD A, L
  emit(0x6f) // LD L, A
  emit(0x26, 0x98) // LD H, 0x98
  emit(0xaf) // XOR A
  emit(0x77) // LD (HL), A — clear
  label('afterClear')

  // move X: X += DX; bounds 8..152 → flip DX
  emit(0xf0, 0x80) // LDH A,(80) X
  emit(0x5f) // LD E, A
  emit(0xf0, 0x82) // LDH A,(82) DX
  emit(0x83) // ADD A, E
  emit(0xe0, 0x80) // LDH (80), A
  emit(0xfe, 0x09) // CP 9
  jr(0x38, 'flipX') // JR C — below lower bound
  emit(0xfe, 0x98) // CP 0x98 (152)
  jr(0x30, 'flipX') // JR NC — above upper bound
  jr(null, 'afterFlipX')
  label('flipX')
  emit(0xf0, 0x82) // LDH A,(82) DX
  emit(0x2f) // CPL
  emit(0x3c) // INC A
  emit(0xe0, 0x82) // LDH (82), A
  label('afterFlipX')

  // move Y: Y += DY; bounds 16..128 → flip DY + blip
  emit(0xf0, 0x81) // LDH A,(81) Y
  emit(0x5f) // LD E, A
  emit(0xf0, 0x83) // LDH A,(83) DY
  emit(0x83) // ADD A, E
  emit(0xe0, 0x81) // LDH (81), A
  emit(0xfe, 0x11) // CP 17
  jr(0x38, 'flipY') // JR C — below lower bound
  emit(0xfe, 0x80) // CP 128
  jr(0x30, 'flipY') // JR NC — above upper bound
  jr(null, 'afterFlipY')
  label('flipY')
  emit(0xf0, 0x83) // LDH A,(83) DY
  emit(0x2f) // CPL
  emit(0x3c) // INC A
  emit(0xe0, 0x83) // LDH (83), A
  // blip: short noise burst (NR42 full, NR43 div, NR44 trigger)
  emit(0x3e, 0xf0) // LD A, 0xF0
  emit(0xe0, 0x21) // NR42
  emit(0x3e, 0x83) // LD A, 0x83
  emit(0xe0, 0x22) // NR43
  emit(0x3e, 0x80) // LD A, 0x80
  emit(0xe0, 0x23) // NR44 trigger
  label('afterFlipY')

  // prev = current
  emit(0xf0, 0x80) // X
  emit(0xe0, 0x84) // prevX
  emit(0xf0, 0x81) // Y
  emit(0xe0, 0x85) // prevY

  // draw: map[0x9800 + (Y>>3)*32 + (X>>3)] = 1
  emit(0xf0, 0x81) // Y
  emit(0xcb, 0x3f)
  emit(0xcb, 0x3f)
  emit(0xcb, 0x3f) // A = Y>>3
  emit(0x6f) // LD L, A
  emit(0x26, 0x00) // LD H, 0
  emit(0x29) // ADD HL, HL x5 = *32
  emit(0x29)
  emit(0x29)
  emit(0x29)
  emit(0x29)
  emit(0xf0, 0x80) // X
  emit(0xcb, 0x3f)
  emit(0xcb, 0x3f)
  emit(0xcb, 0x3f) // A = X>>3
  emit(0x85) // ADD A, L
  emit(0x6f) // LD L, A
  emit(0x26, 0x98) // LD H, 0x98
  emit(0x3e, 0x01) // LD A, 1
  emit(0x77) // LD (HL), A

  // wait for VBlank to end (LY != 144) so the map write lands cleanly
  label('waitEnd')
  emit(0xf0, 0x44)
  emit(0xfe, 0x90) // CP 0x90
  jr(0x28, 'waitEnd') // JR Z
  jp('loop')

  // ---- write program into the ROM at 0x100 ----
  let pc = 0x100
  for (let i = 0; i < org.length; i++) {
    rom[pc + i] = org[i]
  }
  for (const f of fixups) {
    const target = labels[f.label] ?? 0
    if (f.size === 2) {
      // JP: absolute 16-bit little-endian address (lo at f.pos - 1, hi at f.pos)
      const addr = (0x100 + target) & 0xffff
      rom[pc + f.pos - 1] = addr & 0xff
      rom[pc + f.pos] = (addr >> 8) & 0xff
    } else {
      // JR: signed 8-bit offset relative to the byte after the operand
      // (operand sits at f.pos, so execution resumes at f.pos + 1)
      rom[pc + f.pos] = (target - f.pos - 1) & 0xff
    }
  }

  // interrupt vectors: RETI (we poll instead of using interrupts)
  for (const v of [0x40, 0x48, 0x50, 0x58, 0x60]) rom[v] = 0xd9

  // checksums
  let checksum = 0
  for (let i = 0x134; i <= 0x14c; i++) checksum = (checksum - rom[i] - 1) & 0xff
  rom[0x14d] = checksum
  let global = 25
  for (let i = 0x134; i < 0x150; i++) global += rom[i]
  rom[0x14e] = (global >> 8) & 0xff
  rom[0x14f] = global & 0xff

  return rom
}
