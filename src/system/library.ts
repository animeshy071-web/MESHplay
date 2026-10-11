// The self-building library. Unifies the bundled homebrew set with user-added
// PC games (PE-identified), Steam-detected games, and scanned ROMs — persisted
// to the local database. Art, metadata, and playtime all build themselves.

import { GAMES, type GameDef } from '../lib/games'
import type { GameRow } from './db'
import * as db from './db'
import { tryInvoke, isTauri } from './ipc'
import { matchRom, ensureBigDb } from './romdb'
import { normalizeTitle } from './petools'
import { LABEL_TO_PLATFORM, PLATFORM_BY_ID } from '../cores/registry'

/** 'chip8' | 'gb' kept for legacy rows; other kinds are platform ids (nes, snes, psx …). */
export type GameKind = 'chip8' | 'gb' | 'native' | (string & {})

/** The unified game shape every screen consumes. */
export interface Game {
  id: string
  title: string
  tagline: string
  desc: string
  kind: GameKind
  rom?: string // chip8/gb: bundled rom filename or absolute path
  colors: [string, string]
  year?: number
  author?: string
  platform?: string
  publisher?: string
  developer?: string
  exePath?: string
  args?: string
  workDir?: string
  artPath?: string
  artMime?: string
  bannerPath?: string
  logoPath?: string
  tags?: string
  crc32?: number
  source: 'builtin' | 'custom' | 'steam' | 'rom'
  lastPlayed?: number
  seconds?: number
}

type Listener = (games: Game[]) => void

const state: { games: Game[]; loaded: boolean } = { games: [], loaded: false }
const listeners = new Set<Listener>()

function rowToGame(r: GameRow): Game {
  let colors: [string, string] = ['#7c3aed', '#c4b5fd']
  try {
    const parsed = JSON.parse(r.colors) as string[]
    if (Array.isArray(parsed) && parsed.length >= 2) colors = [parsed[0], parsed[1]]
  } catch {
    /* keep default */
  }
  return {
    id: r.id,
    title: r.title,
    tagline: r.tagline,
    desc: r.description,
    kind: r.kind as GameKind,
    rom: r.rom ?? undefined,
    colors,
    year: r.year ?? undefined,
    author: r.developer || r.publisher || undefined,
    platform: r.platform,
    publisher: r.publisher || undefined,
    developer: r.developer || undefined,
    exePath: r.exe_path ?? undefined,
    args: r.args ?? undefined,
    workDir: r.work_dir ?? undefined,
    artPath: r.art ?? undefined,
    artMime: r.art_mime ?? undefined,
    bannerPath: r.banner ?? undefined,
    logoPath: r.logo ?? undefined,
    tags: r.tags ?? undefined,
    crc32: r.crc32 ?? undefined,
    source: r.source as Game['source'],
    lastPlayed: r.last_played ?? undefined,
    seconds: r.seconds ?? undefined,
  }
}

/** Seed the bundled homebrew set into the database on first run. */
async function seedBuiltin(): Promise<void> {
  const existing = await db.listGames()
  const have = new Set(existing.map((g) => g.id))
  for (const g of GAMES) {
    if (have.has(g.id)) continue
    await db.upsertGame({
      id: g.id,
      title: g.title,
      tagline: g.tagline,
      description: g.desc,
      kind: 'chip8',
      rom: g.rom,
      exe_path: null,
      args: null,
      work_dir: null,
      platform: 'CHIP-8',
      publisher: g.author,
      developer: g.author,
      year: parseInt(g.year, 10) || null,
      colors: JSON.stringify(g.colors),
      art: null,
      art_mime: null,
      crc32: null,
      banner: null,
      logo: null,
      tags: null,
      source: 'builtin',
      added_at: 0,
      last_played: null,
      seconds: 0,
    })
  }
}

export async function loadLibrary(): Promise<Game[]> {
  await seedBuiltin()
  void ensureBigDb() // extended OpenVGDB hashes load in the background
  const rows = await db.listGames()
  state.games = rows.map(rowToGame)
  state.loaded = true
  for (const fn of listeners) fn(state.games)
  return state.games
}

export function getGames(): Game[] {
  return state.games
}

export function getGame(id: string): Game | undefined {
  return state.games.find((g) => g.id === id)
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  if (state.loaded) fn(state.games)
  return () => listeners.delete(fn)
}

async function refresh(): Promise<void> {
  await loadLibrary()
}

/** Add/edit a game entry (custom importer dialog). */
export async function saveGame(game: Partial<Game> & { id: string }): Promise<void> {
  const prev = await db.getGame(game.id)
  await db.upsertGame({
    id: game.id,
    title: game.title ?? prev?.title ?? 'Untitled',
    tagline: game.tagline ?? prev?.tagline ?? '',
    description: game.desc ?? prev?.description ?? '',
    kind: (game.kind ?? prev?.kind ?? 'native') as GameRow['kind'],
    rom: game.rom ?? prev?.rom ?? null,
    exe_path: game.exePath ?? prev?.exe_path ?? null,
    args: game.args ?? prev?.args ?? null,
    work_dir: game.workDir ?? prev?.work_dir ?? null,
    platform: game.platform ?? prev?.platform ?? 'PC (Native)',
    publisher: game.publisher ?? prev?.publisher ?? '',
    developer: game.developer ?? prev?.developer ?? '',
    year: game.year ?? prev?.year ?? null,
    colors: JSON.stringify(game.colors ?? safeColors(prev?.colors)),
    art: game.artPath ?? prev?.art ?? null,
    art_mime: game.artMime ?? prev?.art_mime ?? null,
    banner: game.bannerPath ?? prev?.banner ?? null,
    logo: game.logoPath ?? prev?.logo ?? null,
    tags: game.tags ?? prev?.tags ?? null,
    crc32: game.crc32 ?? prev?.crc32 ?? null,
    source: (game.source ?? prev?.source ?? 'custom') as GameRow['source'],
    added_at: prev?.added_at ?? Date.now(),
    last_played: prev?.last_played ?? null,
    seconds: prev?.seconds ?? 0,
  })
  await refresh()
}

/** Remove a game — routed to the Recycle Bin when it owns a real file. */
export async function removeGame(id: string, deleteFiles: boolean): Promise<void> {
  const g = getGame(id)
  await db.deleteGame(id)
  if (deleteFiles && g) {
    for (const p of [g.exePath, g.rom, g.artPath, g.bannerPath, g.logoPath]) {
      if (p && !p.startsWith('http') && !p.startsWith('data:') && !p.startsWith('roms/')) {
        await tryInvoke('delete_to_recycle_bin', { path: p })
      }
    }
  }
  await refresh()
}

// ---------- importers ----------

export interface IdentifyResult {
  game: Game
  identified: boolean
  detail: string
}

/**
 * Identify a picked file: .exe (PE header parse), .lnk (shortcut resolve),
 * .bat, or a folder. Offline only — no scrapers.
 */
export async function identifyFile(path: string): Promise<IdentifyResult | null> {
  const lower = path.toLowerCase()
  const id = `custom-${Date.now().toString(36)}`
  try {
    if (lower.endsWith('.lnk')) {
      const res = await tryInvoke<{ target: string; arguments: string; workDir: string }>('resolve_shortcut', { path })
      if (!res) return null
      return await identifyFile(res.target)
    }
    if (lower.endsWith('.exe')) {
      const info = await tryInvoke<{
        productName: string; fileDescription: string; companyName: string
        fileVersion: string; iconPath: string | null; file_size: number
      }>('identify_exe', { path })
      const title =
        info?.productName?.trim() || info?.fileDescription?.trim() ||
        path.split(/[\\/]/).pop()?.replace(/\.exe$/i, '').replace(/[_\.]/g, ' ') || 'Game'
      return {
        game: {
          id,
          title: title.trim() || 'Game',
          tagline: info?.companyName || 'PC Game',
          desc: info?.fileDescription || '',
          kind: 'native',
          colors: await colorPairFor(title),
          exePath: path,
          platform: 'PC (Native)',
          publisher: info?.companyName || '',
          artPath: info?.iconPath ?? undefined,
          artMime: info?.iconPath ? 'image/x-icon' : undefined,
          source: 'custom',
        },
        identified: !!(info?.productName || info?.fileDescription),
        detail: info?.productName
          ? `PE identified: "${info.productName}" (${info.companyName || 'unknown publisher'})`
          : 'PE parsed — no version metadata; using filename',
      }
    }
    // .bat / any other file / folder → filename heuristics
    const raw = path.split(/[\\/]/).pop() ?? 'Game'
    return {
      game: {
        id,
        title: titleFrom(raw),
        tagline: 'PC Game',
        desc: '',
        kind: 'native',
        colors: await colorPairFor(raw),
        exePath: lower.endsWith('.bat') ? path : undefined,
        platform: 'PC (Native)',
        source: 'custom',
      },
      identified: false,
      detail: 'Added from filename',
    }
  } catch (e) {
    return null
  }
}

function titleFrom(raw: string): string {
  const base = raw.replace(/\.[a-z0-9]+$/i, '').replace(/[_\.]+/g, ' ').trim()
  return base
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Deterministic art colors from the title (so every game gets a stable look). */
async function colorPairFor(title: string): Promise<[string, string]> {
  const n = normalizeTitle(title)
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  const hue = h % 360
  const hue2 = (hue + 40) % 360
  return [`hsl(${hue} 70% 45%)`, `hsl(${hue2} 80% 70%)`]
}

// ---------- Steam scan ----------

export interface SteamScanResult {
  found: number
  added: number
  skipped: number
}

/** Scan Steam libraries (read-only VDF parsing) and add every game. */
export async function scanSteam(): Promise<SteamScanResult> {
  const games = await tryInvoke<{ app_id: number; name: string; installDir: string; exe_path: string | null; size_bytes: number }[]>('scan_steam')
  if (!games) return { found: 0, added: 0, skipped: 0 }
  const existing = new Set((await db.listGames()).map((g) => g.id))
  let added = 0
  let skipped = 0
  for (const s of games) {
    if (!s.exe_path) {
      skipped++
      continue
    }
    const id = `steam-${s.app_id}`
    if (existing.has(id)) {
      skipped++
      continue
    }
    await db.upsertGame({
      id,
      title: s.name,
      tagline: 'Steam',
      description: '',
      kind: 'native',
      rom: null,
      exe_path: s.exe_path,
      args: null,
      work_dir: null,
      platform: 'Steam',
      publisher: '',
      developer: '',
      year: null,
      colors: JSON.stringify(await colorPairFor(s.name)),
      art: null,
      art_mime: null,
      crc32: null,
      source: 'steam',
      added_at: Date.now(),
      last_played: null,
      seconds: 0,
    })
    added++
  }
  await refresh()
  return { found: games.length, added, skipped }
}

// ---------- ROM folder scan ----------

export interface RomScanResult {
  found: number
  added: number
  recognized: number
}

/** Scan a ROM folder recursively; hash-match offline; add playable entries. */
export async function scanRomFolder(folder: string): Promise<RomScanResult> {
  await ensureBigDb() // extended hash DB ready before matching
  const roms = await tryInvoke<{ path: string; name: string; platform: string; crc32: number; size: number }[]>('scan_roms', { folder })
  if (!roms) return { found: 0, added: 0, recognized: 0 }
  const existing = new Set((await db.listGames()).map((g) => g.crc32))
  let added = 0
  let recognized = 0
  for (const r of roms) {
    const kind = LABEL_TO_PLATFORM.get(r.platform)
    const def = kind ? PLATFORM_BY_ID.get(kind) : undefined
    const playable = !!def && def.tier !== 'bridge'
    const hit = r.crc32 ? matchRom(r.crc32) : null
    if (hit) recognized++
    const id = `rom-${r.crc32.toString(16)}`
    if (existing.has(r.crc32) || !playable || !kind) continue
    await db.upsertGame({
      id,
      title: hit?.title ?? titleFrom(r.name),
      tagline: r.platform,
      description: hit ? 'Identified by offline checksum match' : '',
      kind,
      rom: r.path,
      exe_path: null,
      args: null,
      work_dir: null,
      platform: r.platform,
      publisher: hit?.author ?? '',
      developer: hit?.author ?? '',
      year: hit?.year ?? null,
      colors: JSON.stringify(await colorPairFor(hit?.title ?? r.name)),
      art: null,
      art_mime: null,
      crc32: r.crc32,
      source: 'rom',
      added_at: Date.now(),
      last_played: null,
      seconds: 0,
    })
    added++
  }
  await refresh()
  return { found: roms.length, added, recognized }
}

export function isLibraryLoaded(): boolean {
  return state.loaded
}

function safeColors(raw: string | null | undefined): [string, string] {
  try {
    const parsed = JSON.parse(raw ?? '') as unknown
    if (Array.isArray(parsed) && parsed.length >= 2) return [parsed[0], parsed[1]]
  } catch {
    /* fallthrough */
  }
  return ['#7c3aed', '#c4b5fd']
}
