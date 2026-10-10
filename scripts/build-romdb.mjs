// Build an extended offline ROM hash database from an OpenVGDB export.
//
// Usage:
//   1. Download OpenVGDB (https://github.com/OpenVGDB/OpenVGDB/releases) —
//      the .sqlite file, or any CSV with crc32/title/platform/year/developer.
//   2. Convert the interesting rows to CSV with headers:
//        crc32,title,platform,year,developer
//      (hex or decimal crc accepted)
//   3. `node scripts/build-romdb.mjs path/to/roms.csv`
//   4. Output lands in public/romdb.json and ships inside the app. The scan
//      then identifies thousands of ROMs 100% offline.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = process.argv[2]
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/build-romdb.mjs <openvgdb-export.csv>')
  console.error('  CSV headers: crc32,title,platform,year,developer')
  process.exit(1)
}

const raw = readFileSync(src, 'utf8').trim().split(/\r?\n/)
const header = raw.shift().split(',').map((h) => h.trim().toLowerCase())
const idx = (name) => header.indexOf(name)
const cCrc = idx('crc32')
const cTitle = idx('title')
const cPlatform = idx('platform')
const cYear = idx('year')
const cDev = idx('developer')

if (cCrc === -1 || cTitle === -1) {
  console.error('CSV must have at least crc32 and title columns')
  process.exit(1)
}

const db = {}
let count = 0
for (const line of raw) {
  const cols = line.split(',')
  if (cols.length < header.length) continue
  const crcRaw = (cols[cCrc] ?? '').trim().replace(/^0x/i, '')
  if (!/^[0-9a-f]{1,8}$/i.test(crcRaw)) continue
  const crc = parseInt(crcRaw, 16)
  const title = (cols[cTitle] ?? '').trim()
  if (!title || !crc) continue
  const platform = (cols[cPlatform] ?? '').trim()
  const year = parseInt((cols[cYear] ?? '').trim(), 10) || undefined
  const author = (cols[cDev] ?? '').trim() || undefined
  db[crc.toString(16)] = [title, platform, year, author]
  count++
}

const out = resolve(root, 'public', 'romdb.json')
writeFileSync(out, JSON.stringify(db))
console.log(`romdb.json written: ${count} entries → ${out}`)
