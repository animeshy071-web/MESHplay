// Optional online art scrapers — box art, banners, hero backgrounds, logos.
// Steam store search is keyless; SteamGridDB / RAWG / IGDB use the user's own
// API keys, stored locally. Every download lands in the local art folder via
// the native write_art command; nothing is sent anywhere except the provider.

import { isTauri, tryInvoke } from './ipc'

export interface ScrapeResult {
  art?: string // vertical box art (path on disk)
  banner?: string // horizontal banner
  hero?: string // wide hero background
  logo?: string // transparent logo
  source: string
}

interface ApiKeys {
  steamgriddb?: string
  rawg?: string
  igdbId?: string
  igdbSecret?: string
}

const LS_KEYS = 'meshplay.apis.v1'

export function getApiKeys(): ApiKeys {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS) ?? '{}') as ApiKeys
  } catch {
    return {}
  }
}

export function setApiKeys(k: ApiKeys): void {
  try {
    localStorage.setItem(LS_KEYS, JSON.stringify(k))
  } catch {
    /* ignore */
  }
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size > 8 * 1024 * 1024) return null
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Download an image URL and store it in the local art folder. */
async function saveArt(url: string | null | undefined, name: string): Promise<string | undefined> {
  if (!url || !isTauri()) return undefined
  const dataUrl = await toDataUrl(url)
  if (!dataUrl) return undefined
  const res = await tryInvoke<{ path: string }>('write_art', {
    name,
    b64: dataUrl.split(',')[1] ?? '',
  })
  return res?.path ?? undefined
}

// ---------- Steam (keyless) ----------

interface SteamSearch {
  id: number
  name: string
  tiny_image: string
}

async function steamAppId(title: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&cc=us&l=en`,
      { mode: 'cors' },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { items?: SteamSearch[] }
    const items = json.items ?? []
    if (items.length === 0) return null
    // prefer exact-ish name match
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const target = norm(title)
    const exact = items.find((i) => norm(i.name) === target)
    return (exact ?? items[0]).id
  } catch {
    return null
  }
}

async function scrapeSteam(title: string): Promise<ScrapeResult | null> {
  const appId = await steamAppId(title)
  if (!appId) return null
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}`
  return {
    art: await saveArt(`${base}/library_600x900.jpg`, `steam-${appId}-box.jpg`),
    banner: await saveArt(`${base}/header.jpg`, `steam-${appId}-banner.jpg`),
    hero: await saveArt(`${base}/library_hero.jpg`, `steam-${appId}-hero.jpg`),
    logo: await saveArt(`${base}/logo.png`, `steam-${appId}-logo.png`),
    source: 'Steam CDN',
  }
}

// ---------- SteamGridDB ----------

async function sgdGameId(title: string, key: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: Array<{ id: number }> }
    return json.data?.[0]?.id ?? null
  } catch {
    return null
  }
}

async function sgdImages(gameId: number, kind: 'grids' | 'heroes' | 'logos', key: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.steamgriddb.com/api/v2/${kind}/game/${gameId}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return []
    const json = (await res.json()) as { data?: Array<{ url: string; score?: number }> }
    return (json.data ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((d) => d.url)
  } catch {
    return []
  }
}

async function scrapeSteamGridDb(title: string, key: string): Promise<ScrapeResult | null> {
  const gameId = await sgdGameId(title, key)
  if (!gameId) return null
  const [grids, heroes, logos] = await Promise.all([
    sgdImages(gameId, 'grids', key),
    sgdImages(gameId, 'heroes', key),
    sgdImages(gameId, 'logos', key),
  ])
  return {
    art: await saveArt(grids[0], `sgdb-${gameId}-box.jpg`),
    banner: await saveArt(grids[1] ?? heroes[0], `sgdb-${gameId}-banner.jpg`),
    hero: await saveArt(heroes[0], `sgdb-${gameId}-hero.jpg`),
    logo: await saveArt(logos[0], `sgdb-${gameId}-logo.png`),
    source: 'SteamGridDB',
  }
}

// ---------- RAWG ----------

async function scrapeRawg(title: string, key: string): Promise<ScrapeResult | null> {
  try {
    const res = await fetch(`https://api.rawg.io/api/games?search=${encodeURIComponent(title)}&key=${key}`)
    if (!res.ok) return null
    const json = (await res.json()) as { results?: Array<{ background_image: string; background_image_additional?: string; name: string }> }
    const hit = json.results?.[0]
    if (!hit) return null
    return {
      banner: await saveArt(hit.background_image, `rawg-${hit.name.replace(/\W+/g, '-')}-banner.jpg`),
      hero: await saveArt(hit.background_image_additional, `rawg-${hit.name.replace(/\W+/g, '-')}-hero.jpg`),
      source: 'RAWG',
    }
  } catch {
    return null
  }
}

// ---------- IGDB (Twitch credentials) ----------

let igdbToken: { value: string; expiresAt: number } | null = null

async function igdbAuth(keys: ApiKeys): Promise<string | null> {
  if (!keys.igdbId || !keys.igdbSecret) return null
  if (igdbToken && Date.now() < igdbToken.expiresAt) return igdbToken.value
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${keys.igdbId}&client_secret=${keys.igdbSecret}&grant_type=client_credentials`,
      { method: 'POST' },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { access_token: string; expires_in: number }
    igdbToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 - 60_000 }
    return igdbToken.value
  } catch {
    return null
  }
}

async function scrapeIgdb(title: string, keys: ApiKeys): Promise<ScrapeResult | null> {
  const token = await igdbAuth(keys)
  if (!token) return null
  try {
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: { 'Client-ID': keys.igdbId!, Authorization: `Bearer ${token}` },
      body: `search "${title.replace(/"/g, '\\"')}"; fields name,cover.image_id; limit 1;`,
    })
    if (!res.ok) return null
    const json = (await res.json()) as Array<{ cover?: { image_id?: string }; name: string }>
    const coverId = json[0]?.cover?.image_id
    if (!coverId) return null
    const img = (size: string) => `https://images.igdb.com/igdb/image/upload/t_${size}/${coverId}.jpg`
    return {
      art: await saveArt(img('720p'), `igdb-${coverId}-box.jpg`),
      banner: await saveArt(img('720p'), `igdb-${coverId}-banner.jpg`),
      source: 'IGDB',
    }
  } catch {
    return null
  }
}

// ---------- orchestrator ----------

/**
 * Fetch art for a title from the best available provider(s). Steam works
 * keyless; the others require keys in Settings. Returns local file paths.
 */
export async function fetchArt(title: string): Promise<ScrapeResult | { error: string }> {
  const keys = getApiKeys()
  const providers: Array<() => Promise<ScrapeResult | null>> = []
  if (keys.steamgriddb) providers.push(() => scrapeSteamGridDb(title, keys.steamgriddb!))
  providers.push(() => scrapeSteam(title))
  if (keys.rawg) providers.push(() => scrapeRawg(title, keys.rawg!))
  if (keys.igdbId && keys.igdbSecret) providers.push(() => scrapeIgdb(title, keys))

  const merged: ScrapeResult = { source: '' }
  let any = false
  for (const provider of providers) {
    try {
      const r = await provider()
      if (r) {
        any = true
        merged.art = merged.art ?? r.art
        merged.banner = merged.banner ?? r.banner
        merged.hero = merged.hero ?? r.hero
        merged.logo = merged.logo ?? r.logo
        merged.source = merged.source ? `${merged.source} + ${r.source}` : r.source
      }
    } catch {
      /* provider offline — try the next */
    }
  }
  if (!any) return { error: 'No art found (offline, or no provider had this title)' }
  return merged
}
