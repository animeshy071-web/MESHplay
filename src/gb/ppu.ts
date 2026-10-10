// Game Boy PPU — scanline renderer with real mode timing (OAM scan → drawing
// → HBlank → VBlank), background + window + sprites, classic palettes, LYC
// and STAT interrupts. Renders 160x144 RGBA into a persistent framebuffer.

export const GB_W = 160
export const GB_H = 144

export class Ppu {
  vram = new Uint8Array(0x2000)
  oam = new Uint8Array(0xa0)
  framebuffer = new Uint32Array(GB_W * GB_H) // ABGR little-endian RGBA

  // registers
  lcdc = 0x91
  stat = 0x85
  scy = 0
  scx = 0
  ly = 0
  lyc = 0
  bgp = 0xfc
  obp0 = 0xff
  obp1 = 0xff
  wy = 0
  wx = 0

  mode = 2
  modeCycles = 0
  windowLine = 0
  windowActive = false
  statInterruptLine = false

  vblankCallback: (() => void) | null = null
  private dmaSrc = 0
  private dmaProgress = 0

  read(addr: number): number {
    if (addr >= 0x8000 && addr < 0xa000) return this.vram[addr - 0x8000]
    if (addr >= 0xfe00 && addr < 0xfea0) return this.oam[addr - 0xfe00]
    switch (addr) {
      case 0xff40: return this.lcdc
      case 0xff41: return (this.stat & 0x78) | this.mode | 0x80
      case 0xff42: return this.scy
      case 0xff43: return this.scx
      case 0xff44: return this.ly
      case 0xff45: return this.lyc
      case 0xff47: return this.bgp
      case 0xff48: return this.obp0
      case 0xff49: return this.obp1
      case 0xff4a: return this.wy
      case 0xff4b: return this.wx
      default: return 0xff
    }
  }

  write(addr: number, v: number): void {
    if (addr >= 0x8000 && addr < 0xa000) {
      this.vram[addr - 0x8000] = v
      return
    }
    if (addr >= 0xfe00 && addr < 0xfea0) {
      this.oam[addr - 0xfe00] = v
      return
    }
    switch (addr) {
      case 0xff40: {
        const wasOn = (this.lcdc & 0x80) !== 0
        this.lcdc = v
        if (wasOn && !(v & 0x80)) {
          this.ly = 0
          this.mode = 0
          this.modeCycles = 0
          this.framebuffer.fill(0xff000000)
        }
        if (!wasOn && v & 0x80) {
          this.mode = 2
          this.modeCycles = 0
          this.windowLine = 0
        }
        break
      }
      case 0xff41: this.stat = (this.stat & 0x07) | (v & 0x78); break
      case 0xff42: this.scy = v; break
      case 0xff43: this.scx = v; break
      case 0xff45: this.lyc = v; break
      case 0xff47: this.bgp = v; break
      case 0xff48: this.obp0 = v; break
      case 0xff49: this.obp1 = v; break
      case 0xff4a: this.wy = v; break
      case 0xff4b: this.wx = v; break
    }
  }

  /** OAM DMA transfer (0xFF46) — 160 T-cycles, copies to OAM. */
  dmaWrite(v: number): void {
    this.dmaSrc = v << 8
    this.dmaProgress = 0
    // simple immediate copy (games tolerate this)
    for (let i = 0; i < 0xa0; i++) {
      this.oam[i] = this.busRead(this.dmaSrc + i)
    }
  }
  busRead: (addr: number) => number = () => 0xff

  private paletteColor(palette: number, index: number): number {
    const shade = (palette >> (index * 2)) & 3
    // classic DMG green-tinted shades (near-monochrome, matches retro feel)
    switch (shade) {
      case 0: return 0xffe0f8d0 // lightest
      case 1: return 0xffa0c070
      case 2: return 0xff587840
      case 3: return 0xff201808 // darkest
      default: return 0xff000000
    }
  }

  tick(cycles: number, requestInterrupt: (bit: number) => void): void {
    if (!(this.lcdc & 0x80)) {
      this.mode = 0
      this.ly = 0
      return
    }

    this.modeCycles += cycles
    const lycMatch = this.ly === this.lyc
    const statLine = (this.stat & 0x40) !== 0 && lycMatch
    if (statLine && !this.statInterruptLine) requestInterrupt(1)
    this.statInterruptLine = statLine

    switch (this.mode) {
      case 2: // OAM scan: 80 T-cycles
        if (this.modeCycles >= 80) {
          this.modeCycles -= 80
          this.mode = 3
          this.setStatMode(3)
        }
        break
      case 3: // drawing: 172 T-cycles
        if (this.modeCycles >= 172) {
          this.modeCycles -= 172
          this.renderScanline()
          this.mode = 0
          this.setStatMode(0)
          if ((this.stat & 0x08) !== 0) requestInterrupt(1)
        }
        break
      case 0: // HBlank: 204 T-cycles
        if (this.modeCycles >= 204) {
          this.modeCycles -= 204
          this.ly++
          if (this.ly >= GB_H) {
            this.mode = 1
            this.setStatMode(1)
            requestInterrupt(0) // VBlank
            if ((this.stat & 0x10) !== 0) requestInterrupt(1)
            this.vblankCallback?.()
          } else {
            this.mode = 2
            this.setStatMode(2)
            if ((this.stat & 0x20) !== 0) requestInterrupt(1)
          }
        }
        break
      case 1: // VBlank: 10 lines
        if (this.modeCycles >= 456) {
          this.modeCycles -= 456
          this.ly++
          if (this.ly > 153) {
            this.ly = 0
            this.windowLine = 0
            this.windowActive = false
            this.mode = 2
            this.setStatMode(2)
            if ((this.stat & 0x20) !== 0) requestInterrupt(1)
          }
        }
        break
    }
  }

  private setStatMode(m: number): void {
    this.stat = (this.stat & ~0x03) | m
  }

  private tilePixel(tileAddr: number, x: number, y: number): number {
    const row = (y & 7) * 2
    const lo = this.vram[(tileAddr + row) & 0x1fff]
    const hi = this.vram[(tileAddr + row + 1) & 0x1fff]
    const bit = 7 - (x & 7)
    return (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1)
  }

  private renderScanline(): void {
    const line = this.ly
    const base = line * GB_W

    // background + window
    const bgEnable = (this.lcdc & 0x01) !== 0
    const winEnable = (this.lcdc & 0x20) !== 0
    const winMapArea = (this.lcdc & 0x40) !== 0 ? 0x1c00 : 0x1800
    const bgMapArea = (this.lcdc & 0x08) !== 0 ? 0x1c00 : 0x1800
    const tileData = (this.lcdc & 0x10) !== 0 // true: 8000 unsigned; false: 8800 signed

    if (!bgEnable) {
      for (let x = 0; x < GB_W; x++) this.framebuffer[base + x] = this.paletteColor(this.bgp, 0)
    } else {
      for (let x = 0; x < GB_W; x++) {
        let colorIndex = 0
        const windowHere = winEnable && this.windowActive && x >= this.wx - 7 && line >= this.wy
        if (windowHere) {
          const wy2 = this.windowLine
          const wx2 = x - (this.wx - 7)
          const map = winMapArea + ((wy2 >> 3) << 5) + (wx2 >> 3)
          const tileNum = this.vram[map & 0x1fff]
          const tileAddr = tileData ? tileNum * 16 : 0x1000 + (((tileNum << 24) >> 24) * 16)
          colorIndex = this.tilePixel(tileAddr, wx2, wy2)
        } else {
          const sy = (this.scy + line) & 0xff
          const sx = (this.scx + x) & 0xff
          const map = bgMapArea + ((sy >> 3) << 5) + (sx >> 3)
          const tileNum = this.vram[map & 0x1fff]
          const tileAddr = tileData ? tileNum * 16 : 0x1000 + (((tileNum << 24) >> 24) * 16)
          colorIndex = this.tilePixel(tileAddr, sx, sy)
        }
        this.framebuffer[base + x] = this.paletteColor(this.bgp, colorIndex)
      }
      // window line tracking: increments only when the window rendered this line
      if (winEnable && line >= this.wy && this.wx - 7 < GB_W) {
        this.windowLine++
        this.windowActive = true
      }
    }

    // sprites (10 per line max)
    if ((this.lcdc & 0x02) !== 0) {
      const big = (this.lcdc & 0x04) !== 0
      const height = big ? 16 : 8
      let drawn = 0
      for (let i = 0; i < 40 && drawn < 10; i++) {
        const oy = this.oam[i * 4] - 16
        if (line < oy || line >= oy + height) continue
        const ox = this.oam[i * 4 + 1] - 8
        const tile = this.oam[i * 4 + 2] & (big ? 0xfe : 0xff)
        const attrs = this.oam[i * 4 + 3]
        if (ox <= -8 || ox >= GB_W) continue
        const palette = (attrs & 0x10) !== 0 ? this.obp1 : this.obp0
        const flipX = (attrs & 0x20) !== 0
        const flipY = (attrs & 0x40) !== 0
        const priorityBg = (attrs & 0x80) !== 0
        let row = line - oy
        if (flipY) row = height - 1 - row
        const tileAddr = tile * 16 + (row & 7) * 2 + (big && row >= 8 ? 16 : 0)
        for (let px = 0; px < 8; px++) {
          const sx = ox + px
          if (sx < 0 || sx >= GB_W) continue
          const tx = flipX ? 7 - px : px
          const colorIndex = this.tilePixel(tileAddr, tx, 0)
          if (colorIndex === 0) continue // transparent
          if (priorityBg && this.readBgPixelBase(base + sx) !== 0) continue
          this.framebuffer[base + sx] = this.paletteColor(palette, colorIndex)
        }
        drawn++
      }
    }
  }

  private readBgPixelBase(fbIndex: number): number {
    // reverse-map framebuffer color back to a palette index for BG priority
    const c = this.framebuffer[fbIndex]
    if (c === 0xffe0f8d0) return 0
    if (c === 0xffa0c070) return 1
    if (c === 0xff587840) return 2
    return 3
  }

  serialize(): Record<string, unknown> {
    return {
      vram: Array.from(this.vram),
      oam: Array.from(this.oam),
      lcdc: this.lcdc, stat: this.stat, scy: this.scy, scx: this.scx,
      ly: this.ly, lyc: this.lyc, bgp: this.bgp, obp0: this.obp0, obp1: this.obp1,
      wy: this.wy, wx: this.wx, mode: this.mode, modeCycles: this.modeCycles,
      windowLine: this.windowLine,
    }
  }

  restore(s: Record<string, unknown>): void {
    const arr = (v: unknown, len: number): Uint8Array<ArrayBuffer> => {
      const a = new Uint8Array(len)
      if (Array.isArray(v)) {
        for (let i = 0; i < Math.min(len, v.length); i++) a[i] = v[i] as number
      }
      return a
    }
    this.vram = arr(s.vram, 0x2000)
    this.oam = arr(s.oam, 0xa0)
    this.lcdc = s.lcdc as number
    this.stat = s.stat as number
    this.scy = s.scy as number
    this.scx = s.scx as number
    this.ly = s.ly as number
    this.lyc = s.lyc as number
    this.bgp = s.bgp as number
    this.obp0 = s.obp0 as number
    this.obp1 = s.obp1 as number
    this.wy = s.wy as number
    this.wx = s.wx as number
    this.mode = s.mode as number
    this.modeCycles = s.modeCycles as number
    this.windowLine = s.windowLine as number
  }
}
