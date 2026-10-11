// Build-time core bundler — downloads mini-RetroArch emulator cores (official
// emscripten builds) into public/cores/<core>/, so MESHplay ships with every
// emulator embedded. End users never download anything.
//
//   node scripts/fetch-cores.mjs            # every core with a public build
//   node scripts/fetch-cores.mjs --only=nes,snes,psx
//   node scripts/fetch-cores.mjs --list
//
// Cores are GPL/LGPL/BSD/MIT — the license file ships alongside (extracted
// from the archive); source links go to public/cores/manifest.json.

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'cores')
const CDN = 'https://cdn.emulatorjs.org/stable/data/cores'

// platform id → [libretro core ids to try, in order]
const CORES = {
  nes: ['nestopia'],
  snes: ['snes9x'],
  genesis: ['genesis_plus_gx'],
  sms: ['smsplus', 'genesis_plus_gx'],
  gg: ['genesis_plus_gx', 'smsplus'],
  segacd: ['genesis_plus_gx'],
  sega32x: ['picodrive'],
  gba: ['mgba'],
  pce: ['mednafen_pce'],
  neogeo: ['fbneo'],
  arcade: ['fbneo', 'mame2003_plus'],
  coleco: ['fbneo'],
  a7800: ['prosystem'],
  lynx: ['handy'],
  a3do: ['opera'],
  jaguar: ['virtualjaguar'],
  psx: ['pcsx_rearmed'],
  n64: ['mupen64plus_next'],
  saturn: ['yabause'],
  nds: ['melonds'],
  // no public wasm build yet — listed for honesty; script reports them missing
  a2600: ['stella'],
  vectrex: ['vecx'],
  wswan: ['beetle_cygne'],
  msx: ['bluemsx'],
  dc: ['flycast'],
  psp: ['ppsspp'],
  ps2: ['lrps2'],
  gc: ['dolphin'],
  wii: ['dolphin'],
  '3ds': ['azahar'],
}

const args = process.argv.slice(2)
const listOnly = args.includes('--list')
const onlyArg = args.find((a) => a.startsWith('--only='))
const only = onlyArg ? onlyArg.split('=')[1].split(',').filter(Boolean) : null
const wants = Object.entries(CORES).filter(([id]) => !only || only.includes(id))

if (listOnly) {
  console.log('Cores to bundle:')
  for (const [id, names] of wants) console.log(`  ${id.padEnd(10)} ${names.join(' | ')}`)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
const manifestPath = join(OUT, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { cores: {} }

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 4096) throw new Error(`suspiciously small (${buf.length}B)`)
  writeFileSync(dest, buf)
  return buf.length
}

function extract(archive, destDir) {
  // bsdtar (ships with Windows 10+) reads zip and 7z containers
  mkdirSync(destDir, { recursive: true })
  execFileSync('tar', ['-xf', archive, '-C', destDir])
}

function findFile(dir, suffix, depth = 0) {
  if (depth > 4) return null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      const hit = findFile(p, suffix, depth + 1)
      if (hit) return hit
    } else if (entry.name === suffix) {
      return p
    }
  }
  return null
}

let ok = 0
let failed = 0
for (const [platformId, names] of wants) {
  if (manifest.cores[platformId]?.core) {
    console.log(`✓ ${platformId} (already bundled: ${manifest.cores[platformId].core})`)
    ok++
    continue
  }
  let done = false
  for (const core of names) {
    const dataPath = join(tmpdir(), `${core}-wasm.data`)
    const dest = join(tmpdir(), `${core}_x`)
    try {
      console.log(`… ${platformId}: downloading ${core}`)
      const bytes = await download(`${CDN}/${core}-wasm.data`, dataPath)
      console.log(`   downloaded ${(bytes / 1048576).toFixed(1)}MB, extracting…`)
      rmSync(dest, { recursive: true, force: true })
      extract(dataPath, dest)
      const js = findFile(dest, `${core}_libretro.js`)
      const wasm = findFile(dest, `${core}_libretro.wasm`)
      if (!js || !wasm) throw new Error(`archive missing ${core}_libretro.js/.wasm (got: ${readdirSync(dest).join(', ').slice(0, 80)})`)
      const outDir = join(OUT, core)
      mkdirSync(outDir, { recursive: true })
      copyFileSync(js, join(outDir, `${core}.js`))
      copyFileSync(wasm, join(outDir, `${core}.wasm`))
      const license = findFile(dest, 'license.txt')
      if (license) copyFileSync(license, join(outDir, 'license.txt'))
      const coreJson = findFile(dest, 'core.json')
      if (coreJson) copyFileSync(coreJson, join(outDir, 'core.json'))
      manifest.cores[platformId] = {
        core,
        license: 'see license.txt / core repo (GPL/LGPL/BSD/MIT)',
        source: `https://github.com/libretro/${core}`,
        built: Date.now(),
      }
      done = true
      break
    } catch (err) {
      console.log(`   … miss: ${String(err?.message ?? err).split('\n')[0].slice(0, 100)}`)
    }
  }
  if (done) {
    ok++
    console.log(`✓ ${platformId} bundled`)
  } else {
    failed++
    console.log(`✗ ${platformId}: no public wasm build yet (registry keeps it honest)`)
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`\nDone: ${ok} bundled, ${failed} without builds → public/cores/`)
