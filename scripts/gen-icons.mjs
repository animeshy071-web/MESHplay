// Generates every MESHplay icon from a procedural "M squircle" logo:
//   src-tauri/icons/  → 32x32.png, 128x128.png, 128x128@2x.png, icon.png, icon.ico, Square*.png
//   public/remote/    → pwa-192.png, pwa-512.png, maskable-512.png
// Zero assets, zero deps — raw RGBA rasterizer + PNG (zlib) + ICO encoder.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- tiny PNG encoder ----------
function crc32(buf) {
  let c, table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // filter 0 per scanline
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// ---------- procedural logo rasterizer ----------
// MESHplay mark: rounded squircle, gradient (deep space purple -> violet -> lavender),
// giant glowing "M" built from rounded bars + gamepad dot accents.
const VIOLET = { deep: [26, 8, 48], core: [124, 58, 237], lite: [216, 180, 254] }
const lerp = (a, b, t) => a + (b - a) * t
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

function gradient(x, y, size) {
  // diagonal: deep (top-left) -> core (middle) -> lite (bottom-right)
  const t = (x + y) / (2 * size)
  return t < 0.55 ? lerp3(VIOLET.deep, VIOLET.core, t / 0.55) : lerp3(VIOLET.core, VIOLET.lite, (t - 0.55) / 0.45)
}

function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

function coverAA(d) {
  return Math.min(1, Math.max(0, 0.5 - d)) // 1px feather
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const S = size
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return
    const i = (y * S + x) * 4
    const na = a / 255
    const oa = rgba[i + 3] / 255
    const outA = na + oa * (1 - na)
    if (outA <= 0) return
    rgba[i] = (r * na + rgba[i] * oa * (1 - na)) / outA
    rgba[i + 1] = (g * na + rgba[i + 1] * oa * (1 - na)) / outA
    rgba[i + 2] = (b * na + rgba[i + 2] * oa * (1 - na)) / outA
    rgba[i + 3] = outA * 255
  }
  const u = S / 512 // design units

  // 1) squircle plate with vertical gradient + soft top sheen
  const plateR = 110 * u
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = roundedRectSDF(x + 0.5, y + 0.5, S / 2, S / 2, S / 2 - 2 * u, S / 2 - 2 * u, plateR)
      const a = coverAA(d) * 255
      if (a <= 0) continue
      let [r, g, b] = gradient(x, y, S)
      // sheen: brighter diagonal band near top-left
      const sheen = Math.max(0, 1 - Math.hypot(x - S * 0.3, y - S * 0.24) / (S * 0.55))
      r = Math.min(255, r + sheen * 26)
      g = Math.min(255, g + sheen * 18)
      b = Math.min(255, b + sheen * 30)
      // subtle inner shadow at bottom edge
      const shade = Math.max(0, (y / S - 0.72)) * 90
      put(x, y, r * (1 - shade / 255), g * (1 - shade / 255), b * (1 - shade / 255), a)
    }
  }

  // 2) the "M": three rounded vertical bars + two diagonals, white with slight lavender tint
  const bar = (cx, cy, hw, hh) => {
    for (let y = Math.floor((cy - hh - 2 * u)); y < Math.ceil(cy + hh + 2 * u); y++) {
      for (let x = Math.floor((cx - hw - 2 * u)); x < Math.ceil(cx + hw + 2 * u); x++) {
        const d = roundedRectSDF(x + 0.5, y + 0.5, cx, cy, hw, hh, Math.min(hw, hh) * 0.9)
        const a = coverAA(d) * 255
        if (a > 0) put(x, y, 255, 250, 255, a)
      }
    }
  }
  const mH = 74 * u, mW = 30 * u
  const midY = S * 0.52
  bar(S * 0.285, midY, mW, mH)
  bar(S * 0.5, midY - 6 * u, mW, mH + 6 * u)
  bar(S * 0.715, midY, mW, mH)
  // diagonals connecting bar tops to center bar (V notches of the M)
  const diag = (x0, y0, x1, y1) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      bar(lerp(x0, x1, t), lerp(y0, y1, t), mW * 0.72, mW * 0.72)
    }
  }
  diag(S * 0.285, midY - mH + 8 * u, S * 0.5, midY - mH * 0.35)
  diag(S * 0.715, midY - mH + 8 * u, S * 0.5, midY - mH * 0.35)

  // 3) gamepad face dots (ABXY homage) — small translucent circles bottom-right
  const dot = (cx, cy, r, alpha) => {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r
        const a = coverAA(d) * 255 * alpha
        if (a > 0) put(x, y, 255, 255, 255, a)
      }
    }
  }
  dot(S * 0.745, S * 0.845, 10 * u, 0.95)
  dot(S * 0.795, S * 0.875, 7 * u, 0.7)
  dot(S * 0.7, S * 0.885, 7 * u, 0.7)
  dot(S * 0.75, S * 0.925, 5 * u, 0.5)
  return rgba
}

function renderMaskable(size) {
  // PWA maskable: logo centered at 66% safe zone, flat gradient background fills everything
  const inner = renderIcon(Math.round(size * 0.78))
  const rgba = Buffer.alloc(size * size * 4)
  const off = Math.floor((size - inner.length / 4 / size) / 2) // not used — recomputed below
  const iw = Math.round(size * 0.78)
  const ox = Math.floor((size - iw) / 2)
  const oy = ox
  // background gradient (deep -> core)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = gradient(x, y, size * 1.15)
      const i = (y * size + x) * 4
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255
    }
  }
  // composite icon (with its own alpha) over the bg
  for (let y = 0; y < iw; y++) {
    for (let x = 0; x < iw; x++) {
      const si = (y * iw + x) * 4
      const a = inner[si + 3] / 255
      if (a <= 0) continue
      const di = ((y + oy) * size + (x + ox)) * 4
      rgba[di] = inner[si] * a + rgba[di] * (1 - a)
      rgba[di + 1] = inner[si + 1] * a + rgba[di + 1] * (1 - a)
      rgba[di + 2] = inner[si + 2] * a + rgba[di + 2] * (1 - a)
      rgba[di + 3] = 255
    }
  }
  return rgba
}

function encodeICO(images) {
  // images: [{w, h, png}] — PNG-compressed entries (valid since Vista)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dirSize = 16 * images.length
  let offset = 6 + dirSize
  const dirs = []
  for (const img of images) {
    const d = Buffer.alloc(16)
    d[0] = img.w >= 256 ? 0 : img.w
    d[1] = img.h >= 256 ? 0 : img.h
    d[2] = 0 // colors
    d[3] = 0 // reserved
    d.writeUInt16LE(1, 4) // planes
    d.writeUInt16LE(32, 6) // bpp
    d.writeUInt32LE(img.png.length, 8)
    d.writeUInt32LE(offset, 12)
    offset += img.png.length
    dirs.push(d)
  }
  return Buffer.concat([header, ...dirs, ...images.map((i) => i.png)])
}

// ---------- emit ----------
const tauriIcons = join(ROOT, 'src-tauri', 'icons')
const pwaIcons = join(ROOT, 'public', 'remote', 'icons')
mkdirSync(tauriIcons, { recursive: true })
mkdirSync(pwaIcons, { recursive: true })

const png = (size, rgba) => encodePNG(size, size, rgba)

const p32 = png(32, renderIcon(32))
const p128 = png(128, renderIcon(128))
const p256 = png(256, renderIcon(256))
const p512 = png(512, renderIcon(512))
const p64 = png(64, renderIcon(64))
const p48 = png(48, renderIcon(48))
const p16 = png(16, renderIcon(16))

writeFileSync(join(tauriIcons, '32x32.png'), p32)
writeFileSync(join(tauriIcons, '128x128.png'), p128)
writeFileSync(join(tauriIcons, '128x128@2x.png'), p256)
writeFileSync(join(tauriIcons, 'icon.png'), p512)
writeFileSync(join(tauriIcons, 'icon.ico'), encodeICO([
  { w: 16, h: 16, png: p16 },
  { w: 32, h: 32, png: p32 },
  { w: 48, h: 48, png: p48 },
  { w: 64, h: 64, png: p64 },
  { w: 128, h: 128, png: p128 },
  { w: 256, h: 256, png: p256 },
]))
// Windows store / installer squares (Tauri bundler convention)
writeFileSync(join(tauriIcons, 'Square30x30Logo.png'), png(30, renderIcon(30)))
writeFileSync(join(tauriIcons, 'Square44x44Logo.png'), png(44, renderIcon(44)))
writeFileSync(join(tauriIcons, 'Square71x71Logo.png'), png(71, renderIcon(71)))
writeFileSync(join(tauriIcons, 'Square89x89Logo.png'), png(89, renderIcon(89)))
writeFileSync(join(tauriIcons, 'Square107x107Logo.png'), png(107, renderIcon(107)))
writeFileSync(join(tauriIcons, 'Square142x142Logo.png'), png(142, renderIcon(142)))
writeFileSync(join(tauriIcons, 'Square150x150Logo.png'), png(150, renderIcon(150)))
writeFileSync(join(tauriIcons, 'Square284x284Logo.png'), png(284, renderIcon(284)))
writeFileSync(join(tauriIcons, 'Square310x310Logo.png'), png(310, renderIcon(310)))
writeFileSync(join(tauriIcons, 'StoreLogo.png'), png(50, renderIcon(50)))

writeFileSync(join(pwaIcons, 'pwa-192.png'), png(192, renderIcon(192)))
writeFileSync(join(pwaIcons, 'pwa-512.png'), p512)
writeFileSync(join(pwaIcons, 'maskable-512.png'), png(512, renderMaskable(512)))

console.log('[icons] generated: src-tauri/icons (ico + pngs), public/remote/icons (pwa 192/512 + maskable)')
