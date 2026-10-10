// RetroAchievements bridge — real API integration for emulated games.
// Uses the user's own RA username + Web API key (stored locally). ROMs are
// identified by MD5 (RA's hash format, computed in pure TS since WebCrypto
// omits MD5). Shows earned/total achievement progress on the detail page.

const LS_KEY = 'meshplay.retroachievements.v1'
const API_BASE = 'https://retroachievements.org/API'

export interface RaCredentials {
  username: string
  apiKey: string
}

export interface RaProgress {
  gameId: number
  title: string
  icon: string | null
  earned: number
  total: number
  points: number
  achievements: Array<{ title: string; description: string; earned: boolean; badge: string }>
}

export function getRaCredentials(): RaCredentials | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as RaCredentials
    return c.username && c.apiKey ? c : null
  } catch {
    return null
  }
}

export function setRaCredentials(username: string, apiKey: string): void {
  try {
    if (username.trim() && apiKey.trim()) {
      localStorage.setItem(LS_KEY, JSON.stringify({ username: username.trim(), apiKey: apiKey.trim() }))
    } else {
      localStorage.removeItem(LS_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function isRaConfigured(): boolean {
  return getRaCredentials() !== null
}

// ---------- MD5 (RA hashes ROMs with MD5) ----------

function toHexStr(n: number): string {
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
  }
  return s
}

export function md5(bytes: Uint8Array): string {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]
  const K = new Int32Array(64)
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

  const origLen = bytes.length
  const bitLen = origLen * 8
  const withPadding = (((origLen + 8) >>> 6) + 1) << 6
  const msg = new Uint8Array(withPadding)
  msg.set(bytes)
  msg[origLen] = 0x80
  // little-endian 64-bit length (we only write the low 32 bits — ROMs < 512MB)
  msg[withPadding - 8] = bitLen & 0xff
  msg[withPadding - 7] = (bitLen >>> 8) & 0xff
  msg[withPadding - 6] = (bitLen >>> 16) & 0xff
  msg[withPadding - 5] = (bitLen >>> 24) & 0xff

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const M = new Int32Array(16)
  for (let chunk = 0; chunk < withPadding; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const j = chunk + i * 4
      M[i] = msg[j] | (msg[j + 1] << 8) | (msg[j + 2] << 16) | (msg[j + 3] << 24)
    }
    let A = a0
    let B = b0
    let C = c0
    let D = d0
    for (let i = 0; i < 64; i++) {
      let F: number
      let g: number
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + K[i] + M[g]) | 0
      A = D
      D = C
      C = B
      B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }
  return toHexStr(a0) + toHexStr(b0) + toHexStr(c0) + toHexStr(d0)
}

// ---------- API ----------

interface RaGameInfo {
  ID?: number
  Title?: string
  ImageIcon?: string
  NumAchievements?: number
  NumAwardedToUser?: number
  TotalTruePoints?: number
  Achievements?: Record<
    string,
    { Title?: string; Description?: string; BadgeName?: string; DateEarned?: string | null }
  >
}

async function raApi(path: string): Promise<unknown | null> {
  const cred = getRaCredentials()
  if (!cred) return null
  try {
    const res = await fetch(
      `${API_BASE}${path}${path.includes('?') ? '&' : '?'}z=${encodeURIComponent(cred.username)}&y=${encodeURIComponent(cred.apiKey)}`,
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Look up a ROM by its MD5 hash and return the player's achievement progress.
 * Returns null when: not configured, offline, or the hash is unknown to RA.
 */
export async function raProgressForRom(romBytes: Uint8Array): Promise<RaProgress | null> {
  const cred = getRaCredentials()
  if (!cred) return null
  const hash = md5(romBytes)
  const info = (await raApi(`/API_GetGame.php?i=1&f=${hash}`)) as RaGameInfo | null
  if (!info?.ID) return null
  const achievements = Object.values(info.Achievements ?? {}).map((a) => ({
    title: a.Title ?? '',
    description: a.Description ?? '',
    earned: !!a.DateEarned,
    badge: a.BadgeName ? `https://media.retroachievements.org/Badge/${a.BadgeName}.png` : '',
  }))
  return {
    gameId: info.ID,
    title: info.Title ?? 'Unknown',
    icon: info.ImageIcon ? `https://media.retroachievements.org${info.ImageIcon}` : null,
    earned: achievements.filter((a) => a.earned).length,
    total: info.NumAchievements ?? achievements.length,
    points: info.TotalTruePoints ?? 0,
    achievements,
  }
}

/** Highest-hash-match lookup used by the Detail page. */
export async function raProgressForGame(readRom: () => Promise<Uint8Array | null>): Promise<RaProgress | null> {
  if (!isRaConfigured()) return null
  const bytes = await readRom()
  if (!bytes) return null
  return raProgressForRom(bytes)
}
