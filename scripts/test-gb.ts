// GB core smoke test: boots the built-in demo ROM in Node, runs 300 frames,
// and verifies the ball is actually moving (BG map changes) and the PPU renders.
import { GameBoy, buildDemoRom } from '../src/gb/gb.ts'

const rom = buildDemoRom()
console.log('demo rom size:', rom.length, 'title:', String.fromCharCode(...rom.slice(0x134, 0x13c)))

const gb = new GameBoy(rom)
let frames = 0
const mapSnapshots: string[] = []

for (let i = 0; i < 300 && frames < 120; i++) {
  if (gb.runFrame()) {
    frames++
    if (frames % 30 === 0) {
      // hash the BG map to detect movement
      let h = 0
      for (let j = 0; j < 0x400; j++) h = (h * 31 + gb.ppu.vram[0x1800 + j]) | 0
      mapSnapshots.push(`frame ${frames}: mapHash=${h} ballTile=${gb.ppu.vram[0x1800 + ((24 >> 3) << 5) + (16 >> 3)]}`)
    }
  }
}

console.log(mapSnapshots.join('\n'))
const unique = new Set(mapSnapshots.map((s) => s.split('mapHash=')[1]))
console.log(frames > 60 ? `OK: ${frames} frames rendered` : 'FAIL: no frames')
console.log(unique.size > 2 ? 'OK: ball is moving (multiple map states)' : 'FAIL: ball not moving')
const fbNonBlack = Array.from(gb.ppu.framebuffer).filter((c) => (c & 0xffffff) !== 0).length
console.log(fbNonBlack > 0 ? `OK: framebuffer has ${fbNonBlack} lit pixels` : 'FAIL: black screen')

// save state round trip
const snap = gb.serialize()
const ok = gb.restore(snap)
console.log(ok ? 'OK: save state round-trip' : 'FAIL: restore')
