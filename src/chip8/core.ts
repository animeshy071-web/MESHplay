// CHIP-8 virtual machine — original COSMAC VIP behavior:
// wrapping draw, shift uses VX, FX55/FX65 increment I.

export const KEY_MAP: Record<string, number> = {
  Digit1: 0x1, Digit2: 0x2, Digit3: 0x3, Digit4: 0xc,
  KeyQ: 0x4, KeyW: 0x5, KeyE: 0x6, KeyR: 0xd,
  KeyA: 0x7, KeyS: 0x8, KeyD: 0x9, KeyF: 0xe,
  KeyZ: 0xa, KeyX: 0x0, KeyC: 0xb, KeyV: 0xf,
}

const FONT = new Uint8Array([
  0xf0, 0x90, 0x90, 0x90, 0xf0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xf0, 0x10, 0xf0, 0x80, 0xf0, // 2
  0xf0, 0x10, 0xf0, 0x10, 0xf0, // 3
  0x90, 0x90, 0xf0, 0x10, 0x10, // 4
  0xf0, 0x80, 0xf0, 0x10, 0xf0, // 5
  0xf0, 0x80, 0xf0, 0x90, 0xf0, // 6
  0xf0, 0x10, 0x20, 0x40, 0x40, // 7
  0xf0, 0x90, 0xf0, 0x90, 0xf0, // 8
  0xf0, 0x90, 0xf0, 0x10, 0xf0, // 9
  0xf0, 0x90, 0xf0, 0x90, 0x90, // A
  0xe0, 0xa0, 0xe0, 0xa0, 0xe0, // B
  0xf0, 0x80, 0x80, 0x80, 0xf0, // C
  0xe0, 0xa0, 0xe0, 0xa0, 0xe0, // D
  0xf0, 0x80, 0xf0, 0x80, 0x80, // E
  0xf0, 0x80, 0xf0, 0x80, 0xf0, // F
])

export class Chip8 {
  readonly mem = new Uint8Array(4096)
  readonly v = new Uint8Array(16)
  readonly stack = new Uint16Array(16)
  readonly display = new Uint8Array(64 * 32)
  readonly keys = new Uint8Array(16)

  i = 0
  pc = 0x200
  sp = 0
  delay = 0
  sound = 0
  drawFlag = true
  soundOn = false

  constructor(rom: Uint8Array) {
    this.mem.set(FONT, 0x50)
    this.mem.set(rom.subarray(0, 4096 - 0x200), 0x200)
  }

  cycle(): void {
    const op = (this.mem[this.pc] << 8) | this.mem[(this.pc + 1) & 0xfff]
    this.pc = (this.pc + 2) & 0xfff
    const v = this.v
    const x = (op >> 8) & 0xf
    const y = (op >> 4) & 0xf
    const n = op & 0xf
    const nn = op & 0xff
    const nnn = op & 0xfff

    switch (op >> 12) {
      case 0x0:
        if (op === 0x00e0) {
          this.display.fill(0)
          this.drawFlag = true
        } else if (op === 0x00ee && this.sp > 0) {
          this.pc = this.stack[--this.sp]
        }
        break
      case 0x1:
        this.pc = nnn
        break
      case 0x2:
        this.stack[this.sp++] = this.pc
        this.pc = nnn
        break
      case 0x3:
        if (v[x] === nn) this.pc = (this.pc + 2) & 0xfff
        break
      case 0x4:
        if (v[x] !== nn) this.pc = (this.pc + 2) & 0xfff
        break
      case 0x5:
        if (n === 0 && v[x] === v[y]) this.pc = (this.pc + 2) & 0xfff
        break
      case 0x6:
        v[x] = nn
        break
      case 0x7:
        v[x] = (v[x] + nn) & 0xff
        break
      case 0x8:
        switch (n) {
          case 0x0: v[x] = v[y]; break
          case 0x1: v[x] |= v[y]; break
          case 0x2: v[x] &= v[y]; break
          case 0x3: v[x] ^= v[y]; break
          case 0x4: {
            const s = v[x] + v[y]
            v[0xf] = s > 255 ? 1 : 0
            v[x] = s & 0xff
            break
          }
          case 0x5: {
            const d = v[x] - v[y]
            v[0xf] = d < 0 ? 0 : 1
            v[x] = d & 0xff
            break
          }
          case 0x6: {
            v[0xf] = v[x] & 1
            v[x] >>= 1
            break
          }
          case 0x7: {
            const d = v[y] - v[x]
            v[0xf] = d < 0 ? 0 : 1
            v[x] = d & 0xff
            break
          }
          case 0xe: {
            v[0xf] = (v[x] >> 7) & 1
            v[x] = (v[x] << 1) & 0xff
            break
          }
        }
        break
      case 0x9:
        if (n === 0 && v[x] !== v[y]) this.pc = (this.pc + 2) & 0xfff
        break
      case 0xa:
        this.i = nnn
        break
      case 0xb:
        this.pc = (nnn + v[0]) & 0xfff
        break
      case 0xc:
        v[x] = ((Math.random() * 256) | 0) & nn
        break
      case 0xd: {
        const xs = v[x] % 64
        const ys = v[y] % 32
        v[0xf] = 0
        for (let row = 0; row < n; row++) {
          const yy = (ys + row) % 32
          const byte = this.mem[(this.i + row) & 0xfff]
          for (let col = 0; col < 8; col++) {
            if (!(byte & (0x80 >> col))) continue
            const xx = (xs + col) % 64
            const idx = yy * 64 + xx
            if (this.display[idx]) v[0xf] = 1
            this.display[idx] ^= 1
          }
        }
        this.drawFlag = true
        break
      }
      case 0xe:
        if (nn === 0x9e) {
          if (this.keys[v[x] & 0xf]) this.pc = (this.pc + 2) & 0xfff
        } else if (nn === 0xa1) {
          if (!this.keys[v[x] & 0xf]) this.pc = (this.pc + 2) & 0xfff
        }
        break
      case 0xf:
        switch (nn) {
          case 0x07: v[x] = this.delay; break
          case 0x15: this.delay = v[x]; break
          case 0x18: this.sound = v[x]; break
          case 0x1e: this.i = (this.i + v[x]) & 0xfff; break
          case 0x0a: {
            const k = this.keys.indexOf(1)
            if (k < 0) this.pc = (this.pc - 2) & 0xfff
            else v[x] = k
            break
          }
          case 0x29: this.i = 0x50 + (v[x] & 0xf) * 5; break
          case 0x33: {
            const b = v[x]
            this.mem[this.i & 0xfff] = (b / 100) | 0
            this.mem[(this.i + 1) & 0xfff] = ((b / 10) | 0) % 10
            this.mem[(this.i + 2) & 0xfff] = b % 10
            break
          }
          case 0x55:
            for (let j = 0; j <= x; j++) this.mem[(this.i + j) & 0xfff] = v[j]
            this.i = (this.i + x + 1) & 0xfff
            break
          case 0x65:
            for (let j = 0; j <= x; j++) v[j] = this.mem[(this.i + j) & 0xfff]
            this.i = (this.i + x + 1) & 0xfff
            break
        }
        break
    }
  }

  tickTimers(): void {
    if (this.delay > 0) this.delay--
    if (this.sound > 0) {
      this.sound--
      this.soundOn = true
    } else {
      this.soundOn = false
    }
  }
}
