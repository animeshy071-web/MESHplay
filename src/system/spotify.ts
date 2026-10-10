// Spotify Connect — real Web API integration via OAuth 2.0 + PKCE.
// The user supplies their own Client ID (stored locally, never leaves the
// machine). Auth happens in the system browser; the Rust backend catches the
// redirect and we exchange the code from the webview. Playback control needs
// Spotify Premium — free accounts get now-playing display only.

import { invoke, tryInvoke } from './ipc'

export interface SpotifyTrack {
  name: string
  artists: string
  albumArt: string | null
  durationMs: number
  progressMs: number
  isPlaying: boolean
  deviceName: string | null
  canControl: boolean
}

export interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const LS_KEY = 'meshplay.spotify.v1'
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing'

let authState: {
  verifier: string
  clientId: string
  redirectPort: number
} | null = null

function loadTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as SpotifyTokens) : null
  } catch {
    return null
  }
}

function saveTokens(t: SpotifyTokens): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(t))
  } catch {
    /* ignore */
  }
}

export function isConnected(): boolean {
  const t = loadTokens()
  return !!t?.refreshToken
}

export function getClientId(): string {
  try {
    return localStorage.getItem('meshplay.spotify.clientId') ?? ''
  } catch {
    return ''
  }
}

export function setClientId(id: string): void {
  try {
    localStorage.setItem('meshplay.spotify.clientId', id.trim())
  } catch {
    /* ignore */
  }
}

export function disconnect(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
  void tryInvoke('spotify_cancel')
}

// ---------- PKCE helpers ----------

function randomString(len = 96): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ---------- auth flow ----------

/** Open the system browser to authorize; resolves once the code lands. */
export async function beginAuth(): Promise<{ ok: boolean; error?: string }> {
  const clientId = getClientId()
  if (!clientId) return { ok: false, error: 'Add your Spotify Client ID first' }

  const begin = await tryInvoke<{ ok: boolean; port: number }>('spotify_begin')
  const port = begin?.port ?? 8899
  const redirectUri = `http://127.0.0.1:${port}/callback`

  const verifier = randomString()
  const challenge = await pkceChallenge(verifier)
  authState = { verifier, clientId, redirectPort: port }

  const url =
    'https://accounts.spotify.com/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    '&response_type=code' +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&code_challenge_method=S256&code_challenge=${challenge}`

  const opened = await tryInvoke<{ ok: boolean }>('open_url', { url })
  if (opened && opened.ok === false) {
    window.open(url, '_blank', 'noopener')
  }

  // poll the native callback catcher (up to 3 minutes)
  const start = Date.now()
  while (Date.now() - start < 180_000) {
    await new Promise((r) => setTimeout(r, 900))
    const res = await tryInvoke<{ ok: boolean; code: string | null }>('spotify_poll')
    if (res?.code) {
      const exchanged = await exchangeCode(res.code)
      return exchanged
        ? { ok: true }
        : { ok: false, error: 'Token exchange failed — check the Client ID' }
    }
  }
  return { ok: false, error: 'Timed out waiting for Spotify' }
}

async function exchangeCode(code: string): Promise<boolean> {
  if (!authState) return false
  try {
    const body = new URLSearchParams({
      client_id: authState.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `http://127.0.0.1:${authState.redirectPort}/callback`,
      code_verifier: authState.verifier,
    })
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return false
    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
    saveTokens({
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? '',
      expiresAt: Date.now() + json.expires_in * 1000 - 30_000,
    })
    return true
  } catch {
    return false
  }
}

async function freshToken(): Promise<string | null> {
  let t = loadTokens()
  if (!t) return null
  if (Date.now() < t.expiresAt) return t.accessToken
  if (!t.refreshToken) return null
  try {
    const body = new URLSearchParams({
      client_id: getClientId(),
      grant_type: 'refresh_token',
      refresh_token: t.refreshToken,
    })
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
    t = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || t.refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000 - 30_000,
    }
    saveTokens(t)
    return t.accessToken
  } catch {
    return null
  }
}

// ---------- Web API ----------

async function api(path: string, method = 'GET', body?: string): Promise<Response | null> {
  const token = await freshToken()
  if (!token) return null
  try {
    return await fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body,
    })
  } catch {
    return null
  }
}

export async function nowPlaying(): Promise<SpotifyTrack | null> {
  const res = await api('/me/player?additional_types=track')
  if (!res || !res.ok) return null
  const json = (await res.json()) as {
    is_playing: boolean
    progress_ms: number | null
    device: { name: string } | null
    item: {
      name: string
      artists: { name: string }[]
      album: { images: { url: string }[] }
      duration_ms: number
    } | null
  } | null
  if (!json || !json.item) return null
  return {
    name: json.item.name,
    artists: json.item.artists.map((a) => a.name).join(', '),
    albumArt: json.item.album.images[0]?.url ?? null,
    durationMs: json.item.duration_ms,
    progressMs: json.progress_ms ?? 0,
    isPlaying: json.is_playing,
    deviceName: json.device?.name ?? null,
    canControl: true,
  }
}

/** Control playback. Returns an error message on 403 (no Premium / no device). */
async function control(path: string, method: 'PUT' | 'POST', body?: string): Promise<string | null> {
  const res = await api(path, method, body)
  if (!res) return 'Not connected'
  if (res.status === 204 || res.ok) return null
  if (res.status === 403) return 'Spotify Premium is required for playback control'
  if (res.status === 404) return 'No active Spotify device — start playing somewhere first'
  return 'Spotify command failed'
}

export const spotify = {
  play: () => control('/me/player/play', 'PUT'),
  pause: () => control('/me/player/pause', 'PUT'),
  next: () => control('/me/player/next', 'POST'),
  previous: () => control('/me/player/previous', 'POST'),
  volume: (pct: number) => control(`/me/player/volume?volume_percent=${Math.round(pct)}`, 'PUT'),
  seek: (ms: number) => control(`/me/player/seek?position_ms=${Math.round(ms)}`, 'PUT'),
  nowPlaying,
  isConnected,
  beginAuth,
  disconnect,
  getClientId,
  setClientId,
}

/** The redirect target Spotify sends the user back to — surfaced for docs. */
export const CALLBACK_HINT = 'http://127.0.0.1:8899/callback'

export function openSpotifyDashboard(): void {
  void invoke('open_url', { url: 'https://developer.spotify.com/dashboard' })
}
