// Playtime + recents persistence. Feeds the Last Played bar with real data.

const KEY = 'meshplay.playtime.v1'

interface PlayData {
  recents: string[]
  seconds: Record<string, number>
}

interface Store extends PlayData {
  active: string | null
  activeStart: number
}

let store: Store = load()

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as PlayData
      return { recents: d.recents ?? [], seconds: d.seconds ?? {}, active: null, activeStart: 0 }
    }
  } catch {
    /* corrupt store — reset */
  }
  return { recents: [], seconds: {}, active: null, activeStart: 0 }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ recents: store.recents, seconds: store.seconds }))
  } catch {
    /* storage unavailable */
  }
}

export function beginSession(gameId: string): void {
  store.active = gameId
  store.activeStart = Date.now()
  if (!store.recents.includes(gameId)) store.recents.unshift(gameId)
  store.recents = [gameId, ...store.recents.filter((id) => id !== gameId)].slice(0, 8)
  save()
}

export function endSession(): void {
  if (!store.active) return
  const secs = Math.round((Date.now() - store.activeStart) / 1000)
  if (secs > 0) store.seconds[store.active] = (store.seconds[store.active] ?? 0) + secs
  store.active = null
  store.activeStart = 0
  save()
}

export function getRecents(): string[] {
  return [...store.recents]
}

export function getSeconds(gameId: string): number {
  return store.seconds[gameId] ?? 0
}

export function formatPlaytime(gameId: string): string {
  const s = getSeconds(gameId)
  if (s <= 0) return 'Never played'
  if (s < 60) return `${s}s played`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m played`
  return `${Math.floor(m / 60)}h ${m % 60}m played`
}
