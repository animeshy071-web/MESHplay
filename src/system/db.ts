// Typed local database client. In the Tauri desktop app this rides the SQLite
// bridge (Rust, rusqlite); in `npm run dev` web mode the same repository API
// is mirrored on localStorage. All data stays local — zero telemetry.

import { invoke, isTauri, tryInvoke } from './ipc'

// ---------- shared types ----------

export interface GameRow {
  id: string
  title: string
  tagline: string
  description: string
  kind: string
  rom: string | null
  exe_path: string | null
  args: string | null
  work_dir: string | null
  platform: string
  publisher: string
  developer: string
  year: number | null
  colors: string // JSON [a, b]
  art: string | null // file path (native) or data URL (imported in web)
  art_mime: string | null
  crc32: number | null
  source: string // builtin | custom | steam | rom
  added_at: number
  last_played: number | null
  seconds: number
  banner?: string | null // horizontal banner art (path or data URL)
  logo?: string | null // transparent logo (path or data URL)
  tags?: string | null // comma-separated genre tags
}

export interface ScreenshotRow {
  id: string
  game_id: string
  path: string
  created_at: number
}

export interface SaveStateRow {
  id: string
  game_id: string
  slot: string
  data: string
  thumb: string | null
  created_at: number
}

// ---------- localStorage fallback (web dev mode) ----------

const LS = {
  games: 'meshplay.games.v1',
  playtime: 'meshplay.playtime.v1',
  profile: 'meshplay.profile.v1',
  settings: 'meshplay.settings.sql.v1',
  screenshots: 'meshplay.screenshots.v1',
  states: 'meshplay.savestates.v1',
}

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSet(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* full */
  }
}

// ---------- settings table (key/value) ----------

export async function setSetting(key: string, value: string): Promise<void> {
  if (isTauri()) {
    await tryInvoke('db_execute', { sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)', params: [key, value] })
  } else {
    const m = lsGet<Record<string, string>>(LS.settings, {})
    m[key] = value
    lsSet(LS.settings, m)
  }
}

export async function getSetting(key: string): Promise<string | null> {
  if (isTauri()) {
    const rows = (await tryInvoke<{ value: string }[]>('db_query', { sql: 'SELECT value FROM settings WHERE key = ?1', params: [key] })) ?? []
    return rows[0]?.value ?? null
  }
  const m = lsGet<Record<string, string>>(LS.settings, {})
  return m[key] ?? null
}

// ---------- games ----------

export async function listGames(): Promise<GameRow[]> {
  if (isTauri()) {
    return (
      (await tryInvoke<GameRow[]>('db_query', { sql: 'SELECT * FROM games ORDER BY added_at ASC', params: [] })) ?? []
    )
  }
  return lsGet<GameRow[]>(LS.games, [])
}

export async function upsertGame(g: GameRow): Promise<void> {
  if (isTauri()) {
    await tryInvoke(
      'db_execute',
      {
        sql: `INSERT OR REPLACE INTO games
          (id, title, tagline, description, kind, rom, exe_path, args, work_dir, platform,
           publisher, developer, year, colors, art, art_mime, crc32, source, added_at, last_played, seconds,
           banner, logo, tags)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)`,
        params: [
          g.id, g.title, g.tagline, g.description, g.kind, g.rom, g.exe_path, g.args, g.work_dir, g.platform,
          g.publisher, g.developer, g.year, g.colors, g.art, g.art_mime, g.crc32, g.source, g.added_at,
          g.last_played, g.seconds, g.banner ?? null, g.logo ?? null, g.tags ?? null,
        ],
      },
    )
  } else {
    const games = lsGet<GameRow[]>(LS.games, []).filter((x) => x.id !== g.id)
    games.push(g)
    lsSet(LS.games, games)
  }
}

export async function deleteGame(id: string): Promise<void> {
  if (isTauri()) {
    await tryInvoke('db_execute', { sql: 'DELETE FROM games WHERE id = ?1', params: [id] })
  } else {
    lsSet(LS.games, lsGet<GameRow[]>(LS.games, []).filter((x) => x.id !== id))
  }
}

export async function getGame(id: string): Promise<GameRow | null> {
  if (isTauri()) {
    const rows = (await tryInvoke<GameRow[]>('db_query', { sql: 'SELECT * FROM games WHERE id = ?1', params: [id] })) ?? []
    return rows[0] ?? null
  }
  return lsGet<GameRow[]>(LS.games, []).find((g) => g.id === id) ?? null
}

export async function findGameByCrc(crc: number): Promise<GameRow | null> {
  if (isTauri()) {
    const rows =
      (await tryInvoke<GameRow[]>('db_query', { sql: 'SELECT * FROM games WHERE crc32 = ?1 LIMIT 1', params: [crc] })) ?? []
    return rows[0] ?? null
  }
  return lsGet<GameRow[]>(LS.games, []).find((g) => g.crc32 === crc) ?? null
}

// ---------- playtime (SQLite-backed when native) ----------

export interface PlayRow {
  game_id: string
  seconds: number
  last_played: number | null
}

export async function addPlaytime(gameId: string, seconds: number): Promise<void> {
  if (seconds <= 0) return
  if (isTauri()) {
    await tryInvoke('db_execute', {
      sql: `INSERT INTO playtime (game_id, seconds, last_played) VALUES (?1, ?2, ?3)
            ON CONFLICT(game_id) DO UPDATE SET seconds = seconds + ?2, last_played = ?3`,
      params: [gameId, seconds, Date.now()],
    })
    await tryInvoke('db_execute', {
      sql: 'UPDATE games SET seconds = seconds + ?2, last_played = ?3 WHERE id = ?1',
      params: [gameId, seconds, Date.now()],
    })
  } else {
    const m = lsGet<{ seconds: Record<string, number>; recents: string[]; last: Record<string, number> }>(LS.playtime, {
      seconds: {}, recents: [], last: {},
    })
    m.seconds[gameId] = (m.seconds[gameId] ?? 0) + seconds
    m.last[gameId] = Date.now()
    lsSet(LS.playtime, m)
  }
}

export async function getPlaytime(gameId: string): Promise<number> {
  if (isTauri()) {
    const rows = (await tryInvoke<PlayRow[]>('db_query', { sql: 'SELECT seconds FROM playtime WHERE game_id = ?1', params: [gameId] })) ?? []
    return rows[0]?.seconds ?? 0
  }
  const m = lsGet<{ seconds: Record<string, number> }>(LS.playtime, { seconds: {} })
  return m.seconds[gameId] ?? 0
}

export async function allPlaytime(): Promise<Record<string, number>> {
  if (isTauri()) {
    const rows = (await tryInvoke<PlayRow[]>('db_query', { sql: 'SELECT game_id, seconds FROM playtime', params: [] })) ?? []
    const out: Record<string, number> = {}
    for (const r of rows) out[r.game_id] = r.seconds
    return out
  }
  const m = lsGet<{ seconds: Record<string, number> }>(LS.playtime, { seconds: {} })
  return { ...m.seconds }
}

export async function lastPlayedAt(gameId: string): Promise<number | null> {
  if (isTauri()) {
    const rows =
      (await tryInvoke<{ last_played: number | null }[]>('db_query', { sql: 'SELECT last_played FROM playtime WHERE game_id = ?1', params: [gameId] })) ?? []
    return rows[0]?.last_played ?? null
  }
  const m = lsGet<{ last: Record<string, number> }>(LS.playtime, { last: {} })
  return m.last[gameId] ?? null
}

// ---------- profile ----------

export async function setProfile(key: string, value: string): Promise<void> {
  await setSetting(`profile.${key}`, value)
}

export async function getProfile(key: string): Promise<string | null> {
  return getSetting(`profile.${key}`)
}

// ---------- screenshots ----------

export async function addScreenshot(gameId: string, path: string): Promise<void> {
  const row: ScreenshotRow = { id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, game_id: gameId, path, created_at: Date.now() }
  if (isTauri()) {
    await tryInvoke('db_execute', {
      sql: 'INSERT INTO screenshots (id, game_id, path, created_at) VALUES (?1, ?2, ?3, ?4)',
      params: [row.id, row.game_id, row.path, row.created_at],
    })
  } else {
    const list = lsGet<ScreenshotRow[]>(LS.screenshots, [])
    list.unshift(row)
    lsSet(LS.screenshots, list.slice(0, 200))
  }
}

export async function listScreenshots(gameId?: string): Promise<ScreenshotRow[]> {
  if (isTauri()) {
    const rows = gameId
      ? ((await tryInvoke<ScreenshotRow[]>('db_query', { sql: 'SELECT * FROM screenshots WHERE game_id = ?1 ORDER BY created_at DESC', params: [gameId] })) ?? [])
      : ((await tryInvoke<ScreenshotRow[]>('db_query', { sql: 'SELECT * FROM screenshots ORDER BY created_at DESC LIMIT 200', params: [] })) ?? [])
    return rows
  }
  const list = lsGet<ScreenshotRow[]>(LS.screenshots, [])
  return gameId ? list.filter((s) => s.game_id === gameId) : list
}

// ---------- save states (slots with thumbnails) ----------

export async function putSaveState(gameId: string, slot: string, data: string, thumb: string | null): Promise<void> {
  const id = `${gameId}.${slot}`
  const now = Date.now()
  if (isTauri()) {
    await tryInvoke('db_execute', {
      sql: 'INSERT OR REPLACE INTO save_states (id, game_id, slot, data, thumb, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
      params: [id, gameId, slot, data, thumb, now],
    })
  } else {
    const list = lsGet<SaveStateRow[]>(LS.states, []).filter((s) => s.id !== id)
    list.unshift({ id, game_id: gameId, slot, data, thumb, created_at: now })
    lsSet(LS.states, list)
  }
}

export async function getSaveState(gameId: string, slot: string): Promise<SaveStateRow | null> {
  const id = `${gameId}.${slot}`
  if (isTauri()) {
    const rows = (await tryInvoke<SaveStateRow[]>('db_query', { sql: 'SELECT * FROM save_states WHERE id = ?1', params: [id] })) ?? []
    return rows[0] ?? null
  }
  return lsGet<SaveStateRow[]>(LS.states, []).find((s) => s.id === id) ?? null
}

export async function listSaveStates(gameId: string): Promise<SaveStateRow[]> {
  if (isTauri()) {
    return (
      (await tryInvoke<SaveStateRow[]>('db_query', {
        sql: 'SELECT * FROM save_states WHERE game_id = ?1 ORDER BY created_at DESC',
        params: [gameId],
      })) ?? []
    )
  }
  return lsGet<SaveStateRow[]>(LS.states, []).filter((s) => s.game_id === gameId)
}

export async function deleteSaveState(gameId: string, slot: string): Promise<void> {
  const id = `${gameId}.${slot}`
  if (isTauri()) {
    await tryInvoke('db_execute', { sql: 'DELETE FROM save_states WHERE id = ?1', params: [id] })
  } else {
    lsSet(LS.states, lsGet<SaveStateRow[]>(LS.states, []).filter((s) => s.id !== id))
  }
}
