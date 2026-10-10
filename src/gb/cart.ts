// Game Boy cartridge: no-MBC (32KB), MBC1, MBC3 (with RTC), MBC5.
// ROM + RAM loaded from .gb/.gbc files; battery-backed RAM included.

export class Cartridge {
  rom: Uint8Array
  ram: Uint8Array
  mbc = 0
  romBank = 1
  ramBank = 0
  ramEnabled = false
  mode1 = false
  bankLo = 0 // MBC5 low 9 bits
  rtcSel = 0
  rtc: Uint8Array = new Uint8Array(8)
  rtcLatched: Uint8Array = new Uint8Array(5)
  battery: boolean

  constructor(rom: Uint8Array, saveData?: Uint8Array | null) {
    this.rom = rom
    const type = rom[0x147] ?? 0
    this.battery = [0x03, 0x06, 0x09, 0x0d, 0x0f, 0x13, 0x17, 0x1e].includes(type)
    switch (type) {
      case 0x00: case 0x08: case 0x09: this.mbc = 0; break
      case 0x01: case 0x02: case 0x03: case 0xaa: this.mbc = 1; break
      case 0x0f: case 0x10: case 0x11: case 0x12: case 0x13: this.mbc = 3; break
      case 0x19: case 0x1a: case 0x1b: case 0x1c: case 0x1d: case 0x1e: this.mbc = 5; break
      default: this.mbc = type >= 0x19 ? 5 : 1; break
    }
    const ramSizes = [0, 2048, 8192, 32768, 131072, 65536]
    const ramSize = ramSizes[rom[0x149] ?? 0] ?? 0
    this.ram = new Uint8Array(ramSize)
    if (saveData && saveData.length === ramSize) this.ram.set(saveData)
    if (ramSize === 0 && (this.mbc === 1 || this.mbc === 3)) this.ram = new Uint8Array(0)
  }

  loadSave(data: Uint8Array | null): void {
    if (data && data.length === this.ram.length) this.ram.set(data)
  }

  dumpSave(): Uint8Array | null {
    return this.battery && this.ram.length > 0 ? this.ram.slice() : null
  }

  read(addr: number): number {
    if (addr < 0x4000) {
      if (this.mbc === 1 && this.mode1 && this.rom.length > 0x8000) {
        // MBC1 mode 1: bank2 selects the upper ROM bank for the whole 0000-3FFF
        const bank2 = this.ramBank & (this.rom.length > 0x100000 ? 3 : 1)
        const mapped = (bank2 << 5) & 0x7f
        const off = mapped * 0x4000 + addr
        return this.rom[off % this.rom.length]
      }
      return this.rom[addr % this.rom.length]
    }
    if (addr < 0x8000) {
      const bank = this.romBank & 0x7f
      const off = bank * 0x4000 + (addr - 0x4000)
      return this.rom[off % this.rom.length]
    }
    if (addr >= 0xa000 && addr < 0xc000) {
      if (this.mbc === 3 && this.rtcSel >= 0x08) {
        return this.rtcLatched[this.rtcSel - 0x08] ?? 0
      }
      if (!this.ramEnabled || this.ram.length === 0) return 0xff
      return this.ram[(this.ramBank * 0x2000 + (addr - 0xa000)) % this.ram.length]
    }
    return 0xff
  }

  write(addr: number, v: number): void {
    if (addr < 0x2000) {
      if (this.mbc === 5) {
        this.ramEnabled = (v & 0x0f) === 0x0a
      } else if (this.mbc !== 0) {
        this.ramEnabled = (v & 0x0f) === 0x0a
      }
      return
    }
    if (addr < 0x4000) {
      switch (this.mbc) {
        case 1: {
          const bank = v & 0x1f
          this.romBank = bank === 0 ? 1 : bank
          break
        }
        case 3: {
          const bank = v & 0x7f
          this.romBank = bank === 0 ? 1 : bank
          break
        }
        case 5: {
          this.bankLo = v & 0xff
          this.romBank = ((this.ramBank & 1) << 8) | this.bankLo
          break
        }
      }
      return
    }
    if (addr < 0x6000) {
      switch (this.mbc) {
        case 1:
          if (addr < 0x5000) {
            // 0x4000-0x5FFF: RAM bank number / upper ROM bank bits
            if (this.ram.length) this.ramBank = v & (this.rom.length > 0x100000 ? 3 : 1)
          } else {
            // 0x6000-0x7FFF: mode select
            this.mode1 = (v & 1) === 1
          }
          break
        case 3:
          if (addr < 0x5000) {
            if (this.ram.length) this.ramBank = v & 0x03
            this.rtcSel = v & 0x0f
          } else if (addr < 0x6000) {
            if (v === 0x00) this.latchRtc()
          }
          break
        case 5:
          if (addr < 0x5000) {
            this.ramBank = v & 1
            this.romBank = ((this.ramBank & 1) << 8) | this.bankLo
          }
          break
      }
      return
    }
    if (addr >= 0xa000 && addr < 0xc000) {
      if (this.mbc === 3 && this.rtcSel >= 0x08) {
        this.rtc[this.rtcSel - 0x08] = v
        this.rtcLatched[this.rtcSel - 0x08] = v
        return
      }
      if (this.ramEnabled && this.ram.length > 0) {
        this.ram[(this.ramBank * 0x2000 + (addr - 0xa000)) % this.ram.length] = v
      }
    }
  }

  private latchRtc(): void {
    // simple software RTC: tick counters driven by the emulator
    this.rtcLatched.set(this.rtc.subarray(0, 5))
  }
}
