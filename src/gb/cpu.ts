// Game Boy SM83 CPU — full instruction set, interrupt handling, HALT.
// Cycle-accurate-ish (each opcode costs its documented T-cycles).

export class SM83 {
  a = 0
  f = 0
  b = 0
  c = 0
  d = 0
  e = 0
  h = 0
  l = 0
  sp = 0
  pc = 0
  ime = false
  imeDelay = 0 // EI takes effect after the next instruction
  halted = false
  haltBug = false
  bus: { read: (a: number) => number; write: (a: number, v: number) => void }

  constructor(bus: SM83['bus']) {
    this.bus = bus
  }

  // register pair helpers
  get bc(): number {
    return (this.b << 8) | this.c
  }
  set bc(v: number) {
    this.b = (v >> 8) & 0xff
    this.c = v & 0xff
  }
  get de(): number {
    return (this.d << 8) | this.e
  }
  set de(v: number) {
    this.d = (v >> 8) & 0xff
    this.e = v & 0xff
  }
  get hl(): number {
    return (this.h << 8) | this.l
  }
  set hl(v: number) {
    this.h = (v >> 8) & 0xff
    this.l = v & 0xff
  }
  get af(): number {
    return (this.a << 8) | (this.f & 0xf0)
  }
  set af(v: number) {
    this.a = (v >> 8) & 0xff
    this.f = v & 0xf0
  }

  // flag helpers
  get z(): boolean {
    return (this.f & 0x80) !== 0
  }
  get n(): boolean {
    return (this.f & 0x40) !== 0
  }
  get hcarry(): boolean {
    return (this.f & 0x20) !== 0
  }
  get carry(): boolean {
    return (this.f & 0x10) !== 0
  }
  setFlags(z: boolean | null, n: boolean | null, hc: boolean | null, c: boolean | null): void {
    let f = this.f & 0xf0
    if (z !== null) f = z ? f | 0x80 : f & 0x7f
    if (n !== null) f = n ? f | 0x40 : f & 0xbf
    if (hc !== null) f = hc ? f | 0x20 : f & 0xdf
    if (c !== null) f = c ? f | 0x10 : f & 0xef
    this.f = f & 0xf0
  }

  fetch8(): number {
    const v = this.bus.read(this.pc)
    this.pc = (this.pc + 1) & 0xffff
    return v
  }
  fetch16(): number {
    const lo = this.fetch8()
    const hi = this.fetch8()
    return lo | (hi << 8)
  }
  read8(addr: number): number {
    return this.bus.read(addr)
  }
  write8(addr: number, v: number): void {
    this.bus.write(addr, v & 0xff)
  }
  push16(v: number): void {
    this.sp = (this.sp - 1) & 0xffff
    this.write8(this.sp, (v >> 8) & 0xff)
    this.sp = (this.sp - 1) & 0xffff
    this.write8(this.sp, v & 0xff)
  }
  pop16(): number {
    const lo = this.read8(this.sp)
    this.sp = (this.sp + 1) & 0xffff
    const hi = this.read8(this.sp)
    this.sp = (this.sp + 1) & 0xffff
    return lo | (hi << 8)
  }

  // ---- ALU ----
  private add8(v: number, useCarry = false): number {
    const cy = useCarry && this.carry ? 1 : 0
    const r = this.a + v + cy
    this.setFlags(r === 0, false, ((this.a & 0xf) + (v & 0xf) + cy) > 0xf, r > 0xff)
    return r & 0xff
  }
  private sub8(v: number, useCarry = false): number {
    const cy = useCarry && this.carry ? 1 : 0
    const r = this.a - v - cy
    this.setFlags(r === 0, true, ((this.a & 0xf) - (v & 0xf) - cy) < 0, r < 0)
    return r & 0xff
  }
  private and8(v: number): number {
    const r = this.a & v
    this.setFlags(r === 0, false, true, false)
    return r
  }
  private xor8(v: number): number {
    const r = this.a ^ v
    this.setFlags(r === 0, false, false, false)
    return r
  }
  private or8(v: number): number {
    const r = this.a | v
    this.setFlags(r === 0, false, false, false)
    return r
  }
  private cp8(v: number): void {
    this.sub8(v)
  }

  private incReg(v: number): number {
    const r = (v + 1) & 0xff
    this.setFlags(r === 0, false, (v & 0xf) === 0xf, null)
    return r
  }
  private decReg(v: number): number {
    const r = (v - 1) & 0xff
    this.setFlags(r === 0, true, (v & 0xf) === 0, null)
    return r
  }

  private addHL(v: number): void {
    const r = this.hl + v
    this.setFlags(null, false, ((this.hl & 0xfff) + (v & 0xfff)) > 0xfff, r > 0xffff)
    this.hl = r & 0xffff
  }

  private daa(): void {
    let a = this.a
    if (!this.n) {
      if (this.hcarry || (a & 0xf) > 9) a += 0x06
      if (this.carry || a > 0x9f) a += 0x60
      this.setFlags(a === 0, null, false, a > 0xff)
    } else {
      if (this.hcarry) a = (a - 6) & 0xff
      if (this.carry) a = (a - 0x60) & 0xff
      this.setFlags(a === 0, null, false, true)
    }
    this.a = a
  }

  // ---- CB prefix (rotates/shifts/bit ops) ----
  private cbRlc(v: number): number {
    const c = (v >> 7) & 1
    const r = ((v << 1) | c) & 0xff
    this.setFlags(r === 0, false, false, c === 1)
    return r
  }
  private cbRrc(v: number): number {
    const c = v & 1
    const r = ((v >> 1) | (c << 7)) & 0xff
    this.setFlags(r === 0, false, false, c === 1)
    return r
  }
  private cbRl(v: number): number {
    const oldC = this.carry ? 1 : 0
    const c = (v >> 7) & 1
    const r = ((v << 1) | oldC) & 0xff
    this.setFlags(r === 0, false, false, c === 1)
    return r
  }
  private cbRr(v: number): number {
    const oldC = this.carry ? 1 : 0
    const c = v & 1
    const r = ((v >> 1) | (oldC << 7)) & 0xff
    this.setFlags(r === 0, false, false, c === 1)
    return r
  }
  private cbSla(v: number): number {
    const c = (v >> 7) & 1
    const r = (v << 1) & 0xff
    this.setFlags(r === 0, false, false, c === 1)
    return r
  }
  private cbSra(v: number): number {
    const c = v & 1
    const bit7 = v & 0x80
    const r = ((v >> 1) | bit7) & 0xff
    this.setFlags(r === 0, false, false, c === 1)
    return r
  }
  private cbSwap(v: number): number {
    const r = ((v << 4) | (v >> 4)) & 0xff
    this.setFlags(r === 0, false, false, false)
    return r
  }
  private cbSrl(v: number): number {
    const c = v & 1
    const r = (v >> 1) & 0xff
    this.setFlags(r === 0, false, false, c === 1)
    return r
  }

  private cbByte(v: number): number {
    const op = this.fetch8()
    const x = (op >> 6) & 3
    const y = (op >> 3) & 7
    const z = op & 7
    const getReg = (): number => {
      switch (z) {
        case 0: return this.b
        case 1: return this.c
        case 2: return this.d
        case 3: return this.e
        case 4: return this.h
        case 5: return this.l
        case 6: return this.read8(this.hl)
        default: return this.a
      }
    }
    const setReg = (v: number): void => {
      switch (z) {
        case 0: this.b = v; break
        case 1: this.c = v; break
        case 2: this.d = v; break
        case 3: this.e = v; break
        case 4: this.h = v; break
        case 5: this.l = v; break
        case 6: this.write8(this.hl, v); break
        default: this.a = v; break
      }
    }
    void v
    switch (x) {
      case 0: {
        const cur = getReg()
        const r =
          y === 0 ? this.cbRlc(cur)
          : y === 1 ? this.cbRrc(cur)
          : y === 2 ? this.cbRl(cur)
          : y === 3 ? this.cbRr(cur)
          : y === 4 ? this.cbSla(cur)
          : y === 5 ? this.cbSra(cur)
          : y === 6 ? this.cbSwap(cur)
          : this.cbSrl(cur)
        setReg(r)
        return z === 6 ? 16 : 8
      }
      case 1: {
        // BIT y, r
        const bit = (getReg() >> y) & 1
        this.setFlags(bit === 0, false, true, null)
        return z === 6 ? 12 : 8
      }
      case 2: {
        setReg(getReg() & ~(1 << y))
        return z === 6 ? 16 : 8
      }
      default: {
        setReg(getReg() | (1 << y))
        return z === 6 ? 16 : 8
      }
    }
  }

  // ---- interrupts ----
  private checkInterrupts(): number {
    const iflags = this.read8(0xffff) & 0x1f
    const ie = this.read8(0xff0f) & 0x1f
    const pending = iflags & ie
    if (pending === 0) return 0
    if (this.halted) this.halted = false
    if (!this.ime) return 0
    // service highest priority
    for (let bit = 0; bit < 5; bit++) {
      if (pending & (1 << bit)) {
        this.ime = false
        const vector = 0x40 + bit * 8
        this.push16(this.pc)
        this.pc = vector
        this.read8(this.pc) // internal cycle
        this.read8(this.pc)
        return 20
      }
    }
    return 0
  }

  /** One step: returns T-cycles consumed. */
  step(): number {
    if (this.imeDelay > 0) {
      this.imeDelay--
      if (this.imeDelay === 0) this.ime = true
    }
    const interruptCycles = this.checkInterrupts()
    if (interruptCycles > 0) return interruptCycles

    if (this.halted) {
      // halted until an interrupt fires (handled above)
      return 4
    }

    const startPc = this.pc
    const op = this.fetch8()
    let cycles = 4

    const getR = (z: number): number => {
      switch (z) {
        case 0: return this.b
        case 1: return this.c
        case 2: return this.d
        case 3: return this.e
        case 4: return this.h
        case 5: return this.l
        case 6: return this.read8(this.hl)
        default: return this.a
      }
    }
    const setR = (z: number, v: number): void => {
      switch (z) {
        case 0: this.b = v; break
        case 1: this.c = v; break
        case 2: this.d = v; break
        case 3: this.e = v; break
        case 4: this.h = v; break
        case 5: this.l = v; break
        case 6: this.write8(this.hl, v); break
        default: this.a = v; break
      }
    }
    const ccCond = (y: number): boolean => {
      switch (y) {
        case 0: return !this.z
        case 1: return this.z
        case 2: return !this.carry
        default: return this.carry
      }
    }
    const aluOp = (y: number, v: number): void => {
      switch (y) {
        case 0: this.a = this.add8(v); break
        case 1: this.a = this.add8(v, true); break
        case 2: this.a = this.sub8(v); break
        case 3: this.a = this.sub8(v, true); break
        case 4: this.a = this.and8(v); break
        case 5: this.a = this.xor8(v); break
        case 6: this.a = this.or8(v); break
        default: this.cp8(v); break
      }
    }

    const x = (op >> 6) & 3
    const y = (op >> 3) & 7
    const z = op & 7
    const p = (op >> 4) & 3
    const q = (op >> 3) & 1

    if (op === 0xcb) {
      return this.cbByte(0)
    }

    switch (x) {
      case 0:
        switch (z) {
          case 0:
            switch (y) {
              case 0: cycles = 4; break // NOP
              case 1: { // LD (nn), SP
                const nn = this.fetch16()
                this.write8(nn, this.sp & 0xff)
                this.write8((nn + 1) & 0xffff, (this.sp >> 8) & 0xff)
                cycles = 20
                break
              }
              case 2: // STOP
                this.fetch8()
                this.halted = true
                cycles = 4
                break
              case 3: { // JR d
                const d = this.fetch8() << 24 >> 24
                this.pc = (this.pc + d) & 0xffff
                cycles = 12
                break
              }
              case 4: case 5: case 6: case 7: { // JR cc, d
                const cond = ccCond(y - 4)
                const d = this.fetch8() << 24 >> 24
                if (cond) {
                  this.pc = (this.pc + d) & 0xffff
                  cycles = 12
                } else {
                  cycles = 8
                }
                break
              }
            }
            break
          case 1:
            if (q === 0) {
              // LD rp[p], nn  (0x01, 0x11, 0x21, 0x31)
              const n = this.fetch16()
              switch (p) {
                case 0: this.bc = n; break
                case 1: this.de = n; break
                case 2: this.hl = n; break
                default: this.sp = n; break
              }
              cycles = 12
            } else {
              // ADD HL, rp[p]  (0x09, 0x19, 0x29, 0x39)
              switch (p) {
                case 0: this.addHL(this.bc); break
                case 1: this.addHL(this.de); break
                case 2: this.addHL(this.hl); break
                default: this.addHL(this.sp); break
              }
              cycles = 8
            }
            break
          case 2:
            // LD/ST A via (BC/DE/HL±)  (0x02,0x12,0x22,0x32,0x0A,0x1A,0x2A,0x3A)
            if (q === 0) {
              switch (p) {
                case 0: this.write8(this.bc, this.a); cycles = 8; break // LD (BC),A
                case 1: this.write8(this.de, this.a); cycles = 8; break // LD (DE),A
                case 2: this.write8(this.hl, this.a); this.hl = (this.hl + 1) & 0xffff; cycles = 8; break // LDI
                default: this.write8(this.hl, this.a); this.hl = (this.hl - 1) & 0xffff; cycles = 8; break // LDD
              }
            } else {
              switch (p) {
                case 0: this.a = this.read8(this.bc); cycles = 8; break
                case 1: this.a = this.read8(this.de); cycles = 8; break
                case 2: this.a = this.read8(this.hl); this.hl = (this.hl + 1) & 0xffff; cycles = 8; break
                default: this.a = this.read8(this.hl); this.hl = (this.hl - 1) & 0xffff; cycles = 8; break
              }
            }
            break
          case 3:
            // INC/DEC rp[p]  (0x03,0x13,0x23,0x33 / 0x0B,0x1B,0x2B,0x3B)
            {
              const inc = q === 0
              switch (p) {
                case 0: this.bc = inc ? (this.bc + 1) & 0xffff : (this.bc - 1) & 0xffff; break
                case 1: this.de = inc ? (this.de + 1) & 0xffff : (this.de - 1) & 0xffff; break
                case 2: this.hl = inc ? (this.hl + 1) & 0xffff : (this.hl - 1) & 0xffff; break
                default: this.sp = inc ? (this.sp + 1) & 0xffff : (this.sp - 1) & 0xffff; break
              }
            }
            cycles = 8
            break
          case 4:
            setR(y, this.incReg(getR(y)))
            cycles = y === 6 ? 12 : 4
            break
          case 5:
            setR(y, this.decReg(getR(y)))
            cycles = y === 6 ? 12 : 4
            break
          case 6:
            setR(y, this.fetch8())
            cycles = y === 6 ? 12 : 8
            break
          default:
            // RLCA/RRCA/RLA/RRA/DAA/CPL/SCF/CCF
            switch (y) {
              case 0: {
                const c = (this.a >> 7) & 1
                this.a = ((this.a << 1) | c) & 0xff
                this.setFlags(false, false, false, c === 1)
                cycles = 4
                break
              }
              case 1: {
                const c = this.a & 1
                this.a = ((this.a >> 1) | (c << 7)) & 0xff
                this.setFlags(false, false, false, c === 1)
                cycles = 4
                break
              }
              case 2: {
                const oldC = this.carry ? 1 : 0
                const c = (this.a >> 7) & 1
                this.a = ((this.a << 1) | oldC) & 0xff
                this.setFlags(false, false, false, c === 1)
                cycles = 4
                break
              }
              case 3: {
                const oldC = this.carry ? 1 : 0
                const c = this.a & 1
                this.a = ((this.a >> 1) | (oldC << 7)) & 0xff
                this.setFlags(false, false, false, c === 1)
                cycles = 4
                break
              }
              case 4: this.daa(); cycles = 4; break
              case 5: this.a ^= 0xff; this.setFlags(null, true, true, null); cycles = 4; break
              case 6: this.setFlags(null, false, false, true); cycles = 4; break
              default: {
                const c = this.carry
                this.setFlags(null, false, false, !c)
                cycles = 4
                break
              }
            }
            break
        }
        break

      case 1:
        // LD r, r' (0x40-0x7F) — 0x76 is HALT
        if (op === 0x76) {
          this.halted = true
          // HALT bug: if IME is off and an interrupt is pending, pc fails to increment
          if (!this.ime) {
            const pending = this.read8(0xffff) & this.read8(0xff0f) & 0x1f
            if (pending) this.haltBug = true
          }
          cycles = 4
        } else {
          setR(y, getR(z))
          cycles = y === 6 || z === 6 ? 8 : 4
        }
        break

      case 2:
        // ALU r
        aluOp(y, getR(z))
        cycles = z === 6 ? 8 : 4
        break

      default:
        switch (z) {
          case 0:
            switch (y) {
              case 0: case 1: case 2: case 3: {
                // RET cc  (0xC0, 0xC8, 0xD0, 0xD8)
                if (ccCond(y)) {
                  this.pc = this.pop16()
                  cycles = 20
                } else {
                  cycles = 8
                }
                break
              }
              case 4: { // LDH (n), A  (0xE0)
                this.write8(0xff00 + this.fetch8(), this.a)
                cycles = 12
                break
              }
              case 5: { // ADD SP, d  (0xE8)
                const d = this.fetch8() << 24 >> 24
                const r = (this.sp + d) & 0xffff
                this.setFlags(false, false, ((this.sp & 0xf) + (d & 0xf)) > 0xf, ((this.sp & 0xff) + (d & 0xff)) > 0xff)
                this.sp = r
                cycles = 16
                break
              }
              case 6: { // LDH A, (n)  (0xF0)
                this.a = this.read8(0xff00 + this.fetch8())
                cycles = 12
                break
              }
              default: { // LD HL, SP+d  (0xF8)
                const d = this.fetch8() << 24 >> 24
                const r = (this.sp + d) & 0xffff
                this.setFlags(false, false, ((this.sp & 0xf) + (d & 0xf)) > 0xf, ((this.sp & 0xff) + (d & 0xff)) > 0xff)
                this.hl = r
                cycles = 12
                break
              }
            }
            break
          case 1:
            if (q === 0) {
              // POP rp2[p]  (0xC1, 0xD1, 0xE1, 0xF1)
              const v = this.pop16()
              switch (p) {
                case 0: this.bc = v; break
                case 1: this.de = v; break
                case 2: this.hl = v; break
                default: this.af = v; break
              }
              cycles = 12
            } else {
              // RET / RETI / JP (HL) / LD SP, HL  (0xC9, 0xD9, 0xE9, 0xF9)
              switch (y) {
                case 1: // RET
                  this.pc = this.pop16()
                  cycles = 16
                  break
                case 3: // RETI
                  this.pc = this.pop16()
                  this.imeDelay = 1
                  cycles = 16
                  break
                case 5: // JP (HL)
                  this.pc = this.hl
                  cycles = 4
                  break
                default: // LD SP, HL
                  this.sp = this.hl
                  cycles = 8
                  break
              }
            }
            break
          case 2:
            switch (y) {
              case 0: case 1: case 2: case 3: {
                // JP cc, nn  (0xC2, 0xCA, 0xD2, 0xDA)
                if (ccCond(y)) {
                  this.pc = this.fetch16()
                  cycles = 16
                } else {
                  this.pc = (this.pc + 2) & 0xffff
                  cycles = 12
                }
                break
              }
              case 4: { // LD (C), A  (0xE2)
                this.write8(0xff00 + this.c, this.a)
                cycles = 8
                break
              }
              case 5: { // LD (nn), A  (0xEA)
                this.write8(this.fetch16(), this.a)
                cycles = 16
                break
              }
              case 6: { // LD A, (C)  (0xF2)
                this.a = this.read8(0xff00 + this.c)
                cycles = 8
                break
              }
              default: { // LD A, (nn)  (0xFA)
                this.a = this.read8(this.fetch16())
                cycles = 16
                break
              }
            }
            break
          case 3:
            switch (y) {
              case 0: { // JP nn  (0xC3)
                this.pc = this.fetch16()
                cycles = 16
                break
              }
              case 1: {
                if (q === 0 && p === 2) { // JP (HL) handled in z=1; here for op safety
                  this.pc = this.hl
                  cycles = 4
                } else {
                  // 0xCB handled earlier; invalid opcodes → NOP
                  cycles = 4
                }
                break
              }
              case 6: // DI (0xF3)
                this.ime = false
                this.imeDelay = 0
                cycles = 4
                break
              case 7: // EI (0xFB)
                this.imeDelay = 2
                cycles = 4
                break
              default: // invalid opcodes (0xD3, 0xE3, ...) — NOP
                cycles = 4
                break
            }
            break
          case 4:
            // CALL cc, nn  (0xC4, 0xCC, 0xD4, 0xDC)
            if (y < 4 && ccCond(y)) {
              const nn = this.fetch16()
              this.push16(this.pc)
              this.pc = nn
              cycles = 24
            } else {
              this.pc = (this.pc + 2) & 0xffff
              cycles = y < 4 ? 12 : 4
            }
            break
          case 5:
            if (q === 0) {
              if (y === 1) {
                // CALL nn  (0xCD)
                const nn = this.fetch16()
                this.push16(this.pc)
                this.pc = nn
                cycles = 24
              } else {
                // invalid → NOP
                cycles = 4
              }
            } else {
              // PUSH rp2[p]  (0xC5, 0xD5, 0xE5, 0xF5)
              switch (p) {
                case 0: this.push16(this.bc); break
                case 1: this.push16(this.de); break
                case 2: this.push16(this.hl); break
                default: this.push16(this.af); break
              }
              cycles = 16
            }
            break
          case 6:
            // ALU n
            aluOp(y, this.fetch8())
            cycles = 8
            break
          default:
            // RST t
            this.push16(this.pc)
            this.pc = y * 8
            cycles = 16
            break
        }
        break
    }

    // HALT bug: next fetch re-reads the HALT instruction's address
    if (this.haltBug) {
      this.haltBug = false
      this.pc = startPc
    }

    return cycles
  }

  // ---------- state serialization (save states + rewind) ----------
  serialize(): string {
    return JSON.stringify({
      v: 2,
      a: this.a, f: this.f, b: this.b, c: this.c, d: this.d, e: this.e, h: this.h, l: this.l,
      sp: this.sp, pc: this.pc, ime: this.ime, halted: this.halted,
    })
  }

  restore(json: string): boolean {
    try {
      const s = JSON.parse(json) as Record<string, number | boolean>
      if (s.v !== 2) return false
      this.a = s.a as number
      this.f = s.f as number
      this.b = s.b as number
      this.c = s.c as number
      this.d = s.d as number
      this.e = s.e as number
      this.h = s.h as number
      this.l = s.l as number
      this.sp = s.sp as number
      this.pc = s.pc as number
      this.ime = s.ime as boolean
      this.halted = s.halted as boolean
      return true
    } catch {
      return false
    }
  }
}
