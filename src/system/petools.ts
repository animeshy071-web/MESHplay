// Frontend game-identification toolkit.
// - TS PE parser + .lnk parser: used in web dev mode (File API) — the Tauri
//   desktop app uses the native Rust parser with identical semantics.
// - Name normalization + CRC32: shared by both paths and the offline hash DB.

// ---------- PE parsing (works on File objects in web mode) ----------

export interface ExeMetadata {
  productName: string
  fileDescription: string
  companyName: string
  fileVersion: string
  productVersion: string
  legalCopyright: string
  originalFilename: string
  iconDataUrl: string | null
}

const u16 = (d: Uint8Array, o: number) => (o + 2 <= d.length ? d[o] | (d[o + 1] << 8) : 0)
const u32 = (d: Uint8Array, o: number) => (o + 4 <= d.length ? (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0 : 0)

function align4(o: number): number {
  return (o + 3) & ~3
}

function readUtf16z(d: Uint8Array, o: number): [string, number] | null {
  let s = ''
  let i = o
  while (i + 2 <= d.length) {
    const w = u16(d, i)
    i += 2
    if (w === 0) return [s, i - o]
    s += String.fromCharCode(w)
  }
  return null
}

interface ResourceLeaf {
  path: number[]
  rva: number
  size: number
}

function parseSections(d: Uint8Array, coff: number, numSections: number, optSize: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  const start = coff + 20 + optSize
  for (let i = 0; i < numSections; i++) {
    const s = start + i * 40
    out.push([u32(d, s + 12), u32(d, s + 8), u32(d, s + 20)])
  }
  return out
}

function rvaToOffset(sections: Array<[number, number, number]>, rva: number): number | null {
  for (const [va, vsize, raw] of sections) {
    if (rva >= va && rva < va + Math.max(vsize, 1)) return raw + (rva - va)
  }
  return null
}

function walkLeaves(d: Uint8Array, resOff: number, dirOff: number, path: number[], out: ResourceLeaf[]): void {
  if (path.length > 3 || resOff + dirOff + 16 > d.length) return
  const named = u16(d, resOff + dirOff + 12)
  const ided = u16(d, resOff + dirOff + 14)
  for (let i = 0; i < named + ided; i++) {
    const e = resOff + dirOff + 16 + i * 8
    if (e + 8 > d.length) return
    const id = u32(d, e) & 0x7fffffff
    const off = u32(d, e + 4) & 0x7fffffff
    if (off & 0x80000000) {
      path.push(id)
      walkLeaves(d, resOff, off, path, out)
      path.pop()
    } else {
      const de = resOff + off
      out.push({ path: [...path], rva: u32(d, de), size: u32(d, de + 4) })
    }
  }
}

function parseVersionStrings(d: Uint8Array, start: number, end: number, out: Array<[string, string]>): void {
  let o = start
  while (o + 6 <= end) {
    const len = u16(d, o)
    if (len < 6 || o + len > end) break
    const valueLen = u16(d, o + 2)
    const wtype = u16(d, o + 4)
    const kv = readUtf16z(d, o + 6)
    if (!kv) break
    const [key, klen] = kv
    const afterKey = align4(o + 6 + klen)
    if (key === 'StringFileInfo' || key === 'StringTable') {
      parseVersionStrings(d, afterKey, o + len, out)
    } else if (!key.startsWith('VS_') && !key.startsWith('Var') && valueLen > 0 && afterKey < end) {
      if (wtype === 1) {
        const v = readUtf16z(d, afterKey)
        if (v) out.push([key, v[0]])
      } else {
        let endz = afterKey
        while (endz < Math.min(afterKey + valueLen, end) && d[endz] !== 0) endz++
        out.push([key, new TextDecoder().decode(d.subarray(afterKey, endz))])
      }
    }
    o = align4(o + len)
  }
}

/** Parse PE metadata + embedded icon from raw exe bytes. */
export function parseExeBytes(data: Uint8Array): ExeMetadata | null {
  if (data.length < 0x40 || data[0] !== 0x4d || data[1] !== 0x5a) return null
  const peOff = u32(data, 0x3c)
  if (peOff + 24 > data.length || data[peOff] !== 0x50 || data[peOff + 1] !== 0x45) return null
  const coff = peOff + 4
  const numSections = u16(data, coff + 2)
  const optSize = u16(data, coff + 16)
  const optStart = coff + 20
  const magic = u16(data, optStart)
  const ddOff = magic === 0x20b ? optStart + 112 : optStart + 96
  const resRva = u32(data, ddOff + 2 * 8)
  const sections = parseSections(data, coff, numSections, optSize)
  const meta: ExeMetadata = {
    productName: '', fileDescription: '', companyName: '', fileVersion: '',
    productVersion: '', legalCopyright: '', originalFilename: '', iconDataUrl: null,
  }

  if (resRva) {
    const resOff = rvaToOffset(sections, resRva)
    if (resOff != null) {
      const leaves: ResourceLeaf[] = []
      walkLeaves(data, resOff, 0, [], leaves)
      // version strings (RT_VERSION = 16)
      for (const leaf of leaves) {
        if (leaf.path[0] !== 16) continue
        const off = rvaToOffset(sections, leaf.rva)
        if (off == null) continue
        parseVersionStrings(data, off, Math.min(off + leaf.size, data.length), [])
        break
      }
      // re-walk collecting all version leaves properly
      const all: Array<[string, string]> = []
      for (const leaf of leaves) {
        if (leaf.path[0] !== 16) continue
        const off = rvaToOffset(sections, leaf.rva)
        if (off == null) continue
        parseVersionStrings(data, off, Math.min(off + leaf.size, data.length), all)
      }
      const get = (k: string) => all.find(([key]) => key.toLowerCase() === k.toLowerCase())?.[1] ?? ''
      meta.productName = get('ProductName')
      meta.fileDescription = get('FileDescription')
      meta.companyName = get('CompanyName')
      meta.fileVersion = get('FileVersion')
      meta.productVersion = get('ProductVersion')
      meta.legalCopyright = get('LegalCopyright')
      meta.originalFilename = get('OriginalFilename')

      // icon group (RT_GROUP_ICON = 14) → assemble standalone .ico
      const group = leaves.find((l) => l.path[0] === 14)
      if (group) {
        const goff = rvaToOffset(sections, group.rva)
        if (goff != null && goff + 6 <= data.length) {
          const count = u16(data, goff + 4)
          const entries: Array<{ w: number; h: number; bytes: number; id: number; planes: number; bits: number; cc: number }> = []
          for (let i = 0; i < count && goff + 6 + i * 14 + 14 <= data.length; i++) {
            const e = goff + 6 + i * 14
            entries.push({
              w: data[e], h: data[e + 1], cc: data[e + 2],
              planes: u16(data, e + 4), bits: u16(data, e + 6),
              bytes: u32(data, e + 8), id: u16(data, e + 12),
            })
          }
          const images = leaves.filter((l) => l.path[0] === 3)
          const ico = assembleIco(data, sections, entries, images)
          if (ico) {
            const blob = new Blob([ico], { type: 'image/x-icon' })
            meta.iconDataUrl = URL.createObjectURL(blob)
          }
        }
      }
    }
  }
  return meta
}

function assembleIco(
  d: Uint8Array,
  sections: Array<[number, number, number]>,
  entries: Array<{ w: number; h: number; bytes: number; id: number; planes: number; bits: number; cc: number }>,
  images: ResourceLeaf[],
): Uint8Array<ArrayBuffer> | null {
  const dirs: number[] = []
  const blobs: Uint8Array[] = []
  let offset = 6 + entries.length * 16
  for (const e of entries) {
    const img = images.find((l) => l.path[1] === e.id)
    if (!img) continue
    const off = rvaToOffset(sections, img.rva)
    if (off == null) continue
    const blob = d.subarray(off, Math.min(off + img.size, d.length))
    blobs.push(blob)
    dirs.push(e.w >= 256 ? 0 : e.w, e.h >= 256 ? 0 : e.h, e.cc, 0, e.planes & 0xff, (e.planes >> 8) & 0xff, e.bits & 0xff, (e.bits >> 8) & 0xff, e.bytes & 0xff, (e.bytes >> 8) & 0xff, (e.bytes >> 16) & 0xff, (e.bytes >> 24) & 0xff, offset & 0xff, (offset >> 8) & 0xff, (offset >> 16) & 0xff, (offset >> 24) & 0xff)
    offset += blob.length
  }
  if (!blobs.length) return null
  const out = new Uint8Array(6 + entries.length * 16 + blobs.reduce((a, b) => a + b.length, 0))
  out[2] = 1; out[3] = 0; out[4] = entries.length & 0xff; out[5] = (entries.length >> 8) & 0xff
  out.set(new Uint8Array(dirs), 6)
  let p = 6 + entries.length * 16
  for (const b of blobs) {
    out.set(b, p)
    p += b.length
  }
  return out
}

// ---------- .lnk parsing (web fallback; mirrors lnk.rs) ----------

export function parseLnkBytes(data: Uint8Array, lnkName: string): { target: string; args: string } | null {
  const u16l = (o: number) => (o + 2 <= data.length ? data[o] | (data[o + 1] << 8) : 0)
  const u32l = (o: number) => u32(data, o)
  if (data.length < 76 || u32l(0) !== 0x4c) return null
  const flags = u32l(20)
  let o = u32l(0)
  if (flags & 0x1) o += 2 + u16l(o)
  let target = ''
  if (flags & 0x2 && o + 28 <= data.length) {
    const infoSize = u32l(o)
    const localOff = u32l(o + 16)
    const commonOff = u32l(o + 24)
    const readZ = (base: number): string => {
      let s = ''
      let i = base
      while (i < data.length && data[i] !== 0) {
        s += String.fromCharCode(data[i])
        i++
      }
      return s
    }
    if (localOff) target = readZ(o + localOff)
    else if (commonOff) target = readZ(o + commonOff)
    o += infoSize
  }
  // string section — best effort relative path
  if (!target && flags & 0x8) {
    // skip to relative path string block
    let p = o
    const skipStr = (): string => {
      const count = u16l(p)
      p += 2
      const unicode = (flags & 0x80) !== 0
      let s = ''
      if (unicode) {
        for (let i = 0; i < count; i++) {
          const w = u16l(p + i * 2)
          if (w === 0) break
          s += String.fromCharCode(w)
        }
        p += count * 2
      } else {
        for (let i = 0; i < count; i++) {
          if (data[p + i] === 0) break
          s += String.fromCharCode(data[p + i])
        }
        p += count
      }
      return s
    }
    if (flags & 0x4) skipStr()
    const rel = skipStr()
    if (rel) target = rel
  }
  if (!target) {
    // last resort: scan for an absolute path string in the file
    const text = new TextDecoder('latin1').decode(data)
    const m = text.match(/[A-Za-z]:\\[^\u0000"]{3,200}/)
    if (m) target = m[0]
  }
  if (!target) return null
  return { target, args: '' , ...(lnkName ? {} : {}) }
}

// ---------- name normalization ----------

const NOISE = [
  '(64-bit)', '(32-bit)', '(x64)', '(x86)', '(win)', '(pc)', '(final)', '(v1.0)',
  '64-bit', 'x64', 'x86', 'final', 'gog', 'fitgirl', 'repack', 'rip', 'unofficial',
  'hd', 'remastered', 'edition', 'definitive', 'complete', 'enhanced',
]

export function normalizeTitle(raw: string): string {
  let s = raw.trim()
  s = s.replace(/\.[a-z0-9]+$/i, '') // extension
  s = s.replace(/[_\.]+/g, ' ')
  s = s.replace(/[\(\[\{].*?[\)\]\}]/g, ' ') // bracketed noise
  for (const n of NOISE) s = s.replace(new RegExp(`\\b${n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi'), ' ')
  s = s.replace(/[^a-z0-9\s]/gi, ' ')
  s = s.replace(/\s+/g, ' ').trim().toLowerCase()
  return s
}

/** Guess a real game title from a raw filename using PE metadata first, then heuristics. */
export function titleFromFilename(raw: string, meta?: Partial<ExeMetadata> | null): string {
  if (meta?.productName && meta.productName.trim().length >= 2) return meta.productName.trim()
  if (meta?.fileDescription && meta.fileDescription.trim().length >= 2) return meta.fileDescription.trim()
  const base = raw.replace(/\.[a-z0-9]+$/i, '')
  const spaced = base.replace(/[_\.]+/g, ' ').trim()
  return spaced
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// ---------- CRC32 (ROM hashing, mirrors roms.rs) ----------

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

export async function crc32OfBlob(blob: Blob, cap = 128 * 1024 * 1024): Promise<number> {
  const slice = blob.size > cap ? blob.slice(0, cap) : blob
  const buf = new Uint8Array(await slice.arrayBuffer())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
